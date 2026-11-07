import { useCallback, useEffect, useRef, useState } from 'react';
import { getSignalState, SESSION_ACTIONS, SIGNAL_LABEL, summarize, toCsv, toNotice, type Alert, type Checkpoint, type LiveParticipant, type Session } from '@mb/core';
import { api, download, fmtTime, run, supabase } from '../lib';
import { Map } from '../components/Map';
import { RouteEditor } from '../components/RouteEditor';

const ALERT_LABEL = { emergency: 'EMERGÊNCIA', help: 'Pedido de ajuda', signal_lost: 'Sinal perdido' };

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    o.connect(ctx.destination);
    o.frequency.value = 880;
    o.start();
    o.stop(ctx.currentTime + 0.6);
  } catch { /* sem áudio */ }
}

export function EventDetail({ id }: { id: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [tab, setTab] = useState<'live' | 'route'>('live');
  const [now, setNow] = useState(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const names = useRef(new globalThis.Map<string, string>());
  names.current = new globalThis.Map(participants.map((p) => [p.user_id, p.display_name]));

  const reload = useCallback(async () => {
    const [s, p, a] = await Promise.all([api.session(id), api.live(id), api.alerts(id)]);
    setSession(s);
    setParticipants(p);
    setAlerts(a);
  }, [id]);

  useEffect(() => {
    void run('api.event', reload);
    void api.checkpoints(id).then(setCheckpoints);
    const ch = api.subscribe(`admin:${id}`, ['participants', 'alerts'], (change) => {
      const n = toNotice(change, '', (uid) => names.current.get(uid) ?? 'Participante');
      if (n?.kind === 'alert') {
        if (n.urgent) beep();
        if (Notification.permission === 'granted') new Notification(n.title, { body: n.body });
      }
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void reload().catch(() => undefined), 800);
    }, `session_id=eq.${id}`);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    const poll = setInterval(() => void reload().catch(() => undefined), 30_000);
    if (Notification.permission === 'default') void Notification.requestPermission();
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      void supabase.removeChannel(ch);
    };
  }, [id, reload]);

  if (!session) return <div className="card">Carregando…</div>;
  const stats = summarize(participants, alerts, now);
  const open = alerts.filter((a) => !a.resolved_at);
  const nameOf = (uid: string) => participants.find((p) => p.user_id === uid)?.display_name ?? '—';

  async function setStatus(to: Session['status']) {
    if (to === 'ended' && !confirm('Encerrar o evento finaliza o rastreamento de todos. Continuar?')) return;
    await run('admin.set_status', () => api.setStatus(id, to), { session_id: id, to });
    await reload();
  }

  return (
    <>
      <div className="card row">
        <h1 style={{ marginRight: 'auto' }}>{session.name}</h1>
        {SESSION_ACTIONS[session.status].map((a) => (
          <button key={a.to} className={a.to === 'draft' ? 'secondary' : ''} onClick={() => setStatus(a.to)}>{a.label} →</button>
        ))}
        {session.is_test && (
          <button className="secondary" onClick={async () => {
            if (confirm('Apagar esta sessão de teste e todos os dados dela?')) {
              await run('admin.delete_test', () => api.deleteTestSession(id));
              location.hash = '#/eventos';
            }
          }}>Apagar teste</button>
        )}
      </div>

      {open.map((a) => (
        <div key={a.id} className={`alert ${a.type} row`}>
          <span style={{ marginRight: 'auto' }}>
            {ALERT_LABEL[a.type]} · {nameOf(a.user_id)} · {fmtTime(a.created_at)}
            {a.lat != null ? ` · ${a.lat.toFixed(5)}, ${a.lng!.toFixed(5)}` : ' · sem posição'}
          </span>
          <button className="secondary" style={{ color: '#fff', borderColor: '#fff' }} onClick={() => run('admin.resolve_alert', () => api.resolveAlert(a.id)).then(reload)}>Resolvido</button>
        </div>
      ))}

      <div className="stats">
        <div className="stat"><b>{stats.tracking}</b>Monitorando</div>
        <div className="stat"><b>{stats.stale}</b>Sinal desatualizado</div>
        <div className="stat"><b>{stats.finished}</b>Finalizados</div>
        <div className="stat"><b>{stats.not_started}</b>Não iniciados</div>
        <div className="stat"><b>{stats.openAlerts}</b>Alertas abertos</div>
      </div>

      <div className="row">
        <button className={tab === 'live' ? '' : 'secondary'} onClick={() => setTab('live')}>Ao vivo</button>
        <button className={tab === 'route' ? '' : 'secondary'} onClick={() => setTab('route')}>Percurso e apoio</button>
      </div>

      {tab === 'route' ? (
        <RouteEditor sessionId={id} initial={checkpoints} onSaved={setCheckpoints} />
      ) : (
        <div className="grid2">
          <Map checkpoints={checkpoints} participants={participants} alerts={alerts} now={now} />
          <div className="card scroll">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3>Participantes ({stats.total})</h3>
              <button className="secondary" onClick={() => download(`participantes-${id}.csv`, toCsv(participants as never))}>CSV</button>
            </div>
            <table>
              <thead><tr><th>Nome</th><th>Estado</th><th>Últ. posição</th><th>km</th></tr></thead>
              <tbody>
                {[...participants].sort((a, b) => (a.last_at ?? '').localeCompare(b.last_at ?? '')).map((p) => {
                  const s = getSignalState(p as never, now);
                  return (
                    <tr key={p.user_id}>
                      <td>{p.display_name}</td>
                      <td><span className={`badge ${s}`}>{SIGNAL_LABEL[s]}</span></td>
                      <td>{fmtTime(p.last_at)}</td>
                      <td>{(p.distance_m / 1000).toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
