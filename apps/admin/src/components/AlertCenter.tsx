import { useCallback, useEffect, useRef, useState } from 'react';
import { createStatusCache, toNotice, type Api } from '@mb/core';
import { api, fmtTime, logger, run, supabase } from '../lib';
import { Modal } from './Modal';

type OpenAlert = Awaited<ReturnType<Api['openAlerts']>>[number];
type Activity = { id: number; title: string; body: string; sessionId: string; at: Date };

export const ALERT_LABEL = { emergency: 'Emergência', help: 'Pedido de ajuda', signal_lost: 'Sinal perdido' } as const;

function beep(urgent: boolean) {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    o.connect(ctx.destination);
    o.frequency.value = urgent ? 880 : 520;
    o.start();
    o.stop(ctx.currentTime + (urgent ? 1.2 : 0.25));
  } catch { /* sem áudio */ }
}
const canNotify = typeof Notification !== 'undefined';

/**
 * Indicador no cabeçalho (borda piscando enquanto houver alerta aberto) + modal com alertas e atividade.
 * Nada aparece sobre a tela de monitoramento: só som e notificação do sistema para emergência/ajuda.
 */
export function AlertCenter() {
  const [alerts, setAlerts] = useState<OpenAlert[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState(canNotify ? Notification.permission : 'denied');
  const seq = useRef(0);

  const reload = useCallback(() => api.openAlerts().then(setAlerts).catch((e) => logger.error('admin.open_alerts', e)), []);

  useEffect(() => {
    void reload();
    const names = new Map<string, string>();
    let withOld = createStatusCache();
    api.participantStatuses().then((rows) => (withOld = createStatusCache(rows))).catch(() => undefined);
    const ch = api.subscribe('admin-alerts', ['participants', 'alerts', 'help_messages'], async (raw) => {
      const change = withOld(raw);
      const uid = change.new.user_id as string;
      if (uid && !names.has(uid)) (await api.names([uid]).catch(() => [])).forEach((p) => names.set(p.id, p.display_name));
      const n = toNotice(change, '', (id) => names.get(id) ?? 'Participante', { participation: true });
      if (change.table === 'alerts') void reload();
      if (!n) return;
      // Mensagem de participante na conversa de ajuda: som curto + notificação, e entra na atividade.
      if (n.kind === 'help_message') {
        beep(false);
        if (canNotify && Notification.permission === 'granted') new Notification(n.title, { body: n.body });
        setActivity((a) => [{ id: ++seq.current, title: n.title, body: `💬 ${n.title}: ${n.body}`, sessionId: change.new.session_id, at: new Date() }, ...a].slice(0, 30));
        return;
      }
      if (n.kind === 'participation') {
        setActivity((a) => [{ id: ++seq.current, title: n.title, body: n.body, sessionId: change.new.session_id, at: new Date() }, ...a].slice(0, 30));
        return;
      }
      beep(Boolean(n.urgent));
      if (canNotify && Notification.permission === 'granted') new Notification(n.title, { body: n.body });
    });
    const poll = setInterval(reload, 30_000);
    return () => {
      clearInterval(poll);
      void supabase.removeChannel(ch);
    };
  }, [reload]);

  const emergencies = alerts.filter((a) => a.type === 'emergency').length;
  const level = emergencies ? 'emergency' : alerts.length ? 'warn' : 'idle';

  return (
    <>
      <button className={`signal ${level}`} onClick={() => setOpen(true)} aria-label="Abrir alertas">
        <span className="dot" />
        {alerts.length ? `${alerts.length} alerta${alerts.length > 1 ? 's' : ''}${emergencies ? ` · ${emergencies} emergência${emergencies > 1 ? "s" : ""}` : ''}` : 'Sem alertas'}
      </button>
      {open && (
        <Modal label="Alertas" onClose={() => setOpen(false)}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2>Alertas abertos</h2>
              <div className="row">
                {canNotify && permission === 'default' && (
                  <button className="secondary" onClick={async () => setPermission(await Notification.requestPermission())}>Ativar notificações</button>
                )}
                <button className="secondary" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
              </div>
            </div>
            {!alerts.length && <p className="muted">Nenhum alerta aberto.</p>}
            {alerts.map((a) => (
              <div key={a.id} className={`alert-row ${a.type}`}>
                <div>
                  <b>{ALERT_LABEL[a.type]}</b> · {a.profiles?.display_name ?? 'Participante'} · {fmtTime(a.created_at)}
                  <div className="muted">{a.sessions?.name}{a.lat != null ? ` · ${a.lat.toFixed(5)}, ${a.lng!.toFixed(5)}` : ' · sem posição'}</div>
                </div>
                <div className="row">
                  <a className="btn secondary" href={a.type === 'signal_lost' ? `#/evento/${a.session_id}/participantes/${a.user_id}` : `#/evento/${a.session_id}/atendimentos/${a.user_id}`} onClick={() => setOpen(false)}>{a.type === 'signal_lost' ? 'Ver' : 'Atender'}</a>
                  <button onClick={() => run('admin.resolve_alert', () => api.resolveAlert(a.id)).then(reload)}>Resolvido</button>
                </div>
              </div>
            ))}
            <h3 style={{ marginTop: 20 }}>Atividade recente</h3>
            {!activity.length && <p className="muted">Inícios e finalizações aparecem aqui.</p>}
            <ul className="feed">
              {activity.map((a) => <li key={a.id}><span className="muted">{a.at.toLocaleTimeString('pt-BR')}</span> {a.body}</li>)}
            </ul>
        </Modal>
      )}
    </>
  );
}
