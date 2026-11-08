import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeCrowd, SESSION_ACTIONS, summarize, type Alert, type Checkpoint, type LiveParticipant, type Session } from '@mb/core';
import { api, fmtTime, run, supabase } from '../lib';
import { Map } from '../components/Map';
import { RouteEditor } from '../components/RouteEditor';
import { ALERT_LABEL } from '../components/AlertCenter';
import { ReportTab } from '../components/ReportTab';
import { PeopleTab } from '../components/PeopleTab';

const TABS = { monitor: 'Monitoramento', participantes: 'Participantes', alertas: 'Alertas', relatorio: 'Relatório', percurso: 'Percurso' } as const;
type Tab = keyof typeof TABS;
const REASON = { stale: 'Sem sinal', off_route: 'Fora do percurso', behind: 'Retardatário' } as const;

export function EventDetail({ id, tab: initialTab }: { id: string; tab?: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [now, setNow] = useState(Date.now());
  const tab: Tab = initialTab && initialTab in TABS ? (initialTab as Tab) : 'monitor';
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const reload = useCallback(async () => {
    const [s, p, a] = await Promise.all([api.session(id), api.live(id), api.alerts(id)]);
    setSession(s);
    setParticipants(p);
    setAlerts(a);
  }, [id]);

  useEffect(() => {
    void run('api.event', reload);
    void api.checkpoints(id).then(setCheckpoints);
    const ch = api.subscribe(`admin:${id}`, ['participants', 'alerts'], () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void reload().catch(() => undefined), 800);
    }, `session_id=eq.${id}`);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    const poll = setInterval(() => void reload().catch(() => undefined), 30_000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      void supabase.removeChannel(ch);
    };
  }, [id, reload]);

  if (!session) return <div className="card skeleton">Carregando…</div>;
  const stats = summarize(participants, alerts, now);
  const crowd = analyzeCrowd(participants, checkpoints, now);
  const open = alerts.filter((a) => !a.resolved_at);
  const nameOf = (uid: string) => participants.find((p) => p.user_id === uid)?.display_name ?? '—';
  const maxSeg = Math.max(1, ...crowd.segments.map((s) => s.count));

  async function setStatus(to: Session['status']) {
    if (to === 'ended' && !confirm('Encerrar o evento finaliza o rastreamento de todos. Continuar?')) return;
    await run('admin.set_status', () => api.setStatus(id, to), { session_id: id, to });
    await reload();
  }

  return (
    <>
      <div className="row page-head">
        <div style={{ marginRight: 'auto' }}>
          <h1>{session.name}</h1>
          <span className={`status-pill ${session.status}`}>{session.status === 'live' ? 'Ao vivo' : session.status}</span>
        </div>
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

      <nav className="tabs">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <a key={t} href={`#/evento/${id}/${t}`} className={`tab ${tab === t ? 'active' : ''} ${t === 'alertas' && open.length ? 'blink' : ''}`}>
            {TABS[t]}{t === 'alertas' && open.length ? ` (${open.length})` : ''}
          </a>
        ))}
      </nav>

      {tab === 'monitor' && (
        <div className="grid2 fade-in">
          <Map checkpoints={checkpoints} participants={participants} alerts={open} now={now} />
          <div className="side">
            <div className="kpis">
              <div className="kpi ok"><b>{stats.tracking}</b>Ativos</div>
              <div className="kpi warn"><b>{stats.stale}</b>Sem sinal</div>
              <div className="kpi"><b>{stats.finished}</b>Finalizados</div>
            </div>

            <div className="card">
              <h3>Onde está o grupo</h3>
              {crowd.majority ? (
                <p className="headline"><b>{Math.round(crowd.majority.share * 100)}%</b> entre {crowd.majority.label}</p>
              ) : (
                <p className="muted">{checkpoints.length < 2 ? 'Cadastre o percurso para ver a distribuição.' : 'Sem posições ativas.'}</p>
              )}
              {crowd.segments.map((s) => (
                <div key={s.label} className="bar-row" title={`${s.count} participantes`}>
                  <span>{s.label}</span>
                  <div className="bar"><i style={{ width: `${(s.count / maxSeg) * 100}%` }} /></div>
                  <b>{s.count}</b>
                </div>
              ))}
            </div>

            <div className="card">
              <h3>Atenção</h3>
              {!crowd.attention.length && <p className="muted">Ninguém fora do padrão.</p>}
              {crowd.attention.map((a) => (
                <div key={a.user_id} className={`attention ${a.reason}`}>
                  <b>{a.name}</b><span>{REASON[a.reason]} · {a.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'participantes' && <PeopleTab sessionId={id} participants={participants} alerts={alerts} checkpoints={checkpoints} now={now} onChanged={() => void reload()} />}

      {tab === 'alertas' && (
        <div className="card scroll fade-in">
          <h3>Alertas ({open.length} abertos)</h3>
          {!alerts.length && <p className="muted">Nenhum alerta neste evento.</p>}
          <table>
            <thead><tr><th>Tipo</th><th>Participante</th><th>Hora</th><th>Posição</th><th></th></tr></thead>
            <tbody>
              {[...alerts].sort((a, b) => Number(!!a.resolved_at) - Number(!!b.resolved_at)).map((a) => (
                <tr key={a.id} className={a.resolved_at ? 'resolved' : ''}>
                  <td><span className={`badge alert-${a.type}`}>{ALERT_LABEL[a.type]}</span></td>
                  <td>{nameOf(a.user_id)}</td>
                  <td>{fmtTime(a.created_at)}</td>
                  <td>{a.lat != null ? `${a.lat.toFixed(5)}, ${a.lng!.toFixed(5)}` : '—'}</td>
                  <td>{a.resolved_at ? <span className="muted">Resolvido {fmtTime(a.resolved_at)}</span> : (
                    <button onClick={() => run('admin.resolve_alert', () => api.resolveAlert(a.id)).then(reload)}>Resolvido</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'relatorio' && <ReportTab sessionId={id} alerts={alerts} checkpoints={checkpoints} />}

      {tab === 'percurso' && <RouteEditor sessionId={id} initial={checkpoints} onSaved={setCheckpoints} />}
    </>
  );
}
