import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeCrowd, lineToPoints, SESSION_ACTIONS, summarize, type Alert, type Checkpoint, type LiveParticipant, type Session } from '@mb/core';
import { api, fmtTime, run, runOk, supabase } from '../lib';
import { Map } from '../components/Map';
import { RouteEditor } from '../components/RouteEditor';
import { ALERT_LABEL } from '../components/AlertCenter';
import { ReportTab } from '../components/ReportTab';
import { PeopleTab } from '../components/PeopleTab';
import { confirmDialog, toast } from '../components/Feedback';

const TABS = { monitor: 'Monitoramento', participantes: 'Participantes', alertas: 'Alertas', relatorio: 'Relatório', percurso: 'Percurso' } as const;
type Tab = keyof typeof TABS;
const STATUS_PT = { draft: 'Rascunho', published: 'Publicado', live: 'Ao vivo', ended: 'Encerrado', archived: 'Arquivado' } as const;
const REASON = { stale: 'Sem sinal', off_route: 'Fora do percurso', behind: 'Retardatário' } as const;

/** `extra` na URL: no monitoramento, pessoa em foco; em participantes, `f-<filtro>` ou pessoa com perfil aberto. */
export function EventDetail({ id, tab: initialTab, extra }: { id: string; tab?: string; extra?: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [now, setNow] = useState(Date.now());
  const tab: Tab = initialTab && initialTab in TABS ? (initialTab as Tab) : 'monitor';
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Seleção no monitoramento: um trecho/grupo aberto e/ou uma pessoa em foco no mapa.
  const [group, setGroup] = useState<string | null>(null);
  const focus = tab === 'monitor' ? extra ?? null : null;
  const focusOn = (uid: string | null) => { location.hash = `#/evento/${id}/monitor${uid ? `/${uid}` : ''}`; };
  const profile = (uid: string) => `#/evento/${id}/participantes/${uid}`;

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
  const path = lineToPoints(session.route);
  const crowd = analyzeCrowd(participants, checkpoints, now, path);
  const open = alerts.filter((a) => !a.resolved_at);
  const nameOf = (uid: string) => participants.find((p) => p.user_id === uid)?.display_name ?? '—';
  const maxSeg = Math.max(1, ...crowd.segments.map((s) => s.count));
  const nameOf2 = (uid: string) => participants.find((p) => p.user_id === uid)?.display_name ?? '—';
  // Grupos clicáveis: trechos do percurso e tipos de desvio (todos, não só os 5 do cartão).
  const groups: Record<string, { label: string; ids: string[] }> = {
    ...Object.fromEntries(crowd.segments.map((sg) => [`seg:${sg.label}`, { label: sg.label, ids: sg.user_ids }])),
    ...Object.fromEntries((Object.keys(REASON) as (keyof typeof REASON)[]).map((r) => [`out:${r}`, { label: REASON[r], ids: [...new Set(crowd.outliers.filter((o) => o.reason === r).map((o) => o.user_id))] }])),
  };
  const open_ = group ? groups[group] : null;
  const highlight = open_ ? new Set(open_.ids) : undefined;
  const toggle = (key: string) => setGroup((g) => (g === key ? null : key));

  const DONE: Record<string, string> = { published: 'Evento publicado: já aparece no app.', live: 'Evento iniciado: participantes já podem começar.', draft: 'Evento voltou para rascunho.', ended: 'Evento encerrado.', archived: 'Evento arquivado.' };
  async function setStatus(to: Session['status']) {
    if (to === 'ended' && !(await confirmDialog({
      title: 'Encerrar o evento?', body: 'O rastreamento de todos os participantes termina agora. Não dá para desfazer.',
      confirmLabel: 'Encerrar evento', danger: true, typeToConfirm: 'ENCERRAR',
    }))) return;
    if (await runOk('admin.set_status', () => api.setStatus(id, to), { session_id: id, to })) toast(DONE[to]);
    await reload();
  }
  async function deleteTest() {
    if (!(await confirmDialog({ title: 'Apagar esta sessão de teste?', body: 'Todos os dados dela (participantes, posições, alertas) serão apagados.', confirmLabel: 'Apagar teste', danger: true }))) return;
    if (await runOk('admin.delete_test', () => api.deleteTestSession(id))) {
      toast('Sessão de teste apagada.');
      location.hash = '#/eventos';
    }
  }
  // Laranja só para o próximo passo positivo; o resto (inclusive encerrar/apagar) fica no menu.
  const actions = SESSION_ACTIONS[session.status];
  const primary = actions.find((a) => a.to === 'published' || a.to === 'live');
  const more = actions.filter((a) => a !== primary);

  return (
    <>
      <div className="row page-head">
        <div style={{ marginRight: 'auto' }}>
          <h1>{session.name}</h1>
          <span className={`status-pill ${session.status}`}>{STATUS_PT[session.status]}</span>
        </div>
        {primary && <button onClick={() => setStatus(primary.to)}>{primary.label} →</button>}
        {(more.length > 0 || session.is_test) && (
          <details className="menu">
            <summary className="btn secondary">Mais ações ▾</summary>
            <div className="menu-list" onClick={(e) => (e.currentTarget.parentElement as HTMLDetailsElement).removeAttribute('open')}>
              {more.map((a) => (
                <button key={a.to} className={a.to === 'ended' ? 'danger-text' : 'secondary'} onClick={() => setStatus(a.to)}>{a.label}{a.to === 'ended' ? '…' : ''}</button>
              ))}
              {session.is_test && <button className="danger-text" onClick={deleteTest}>Apagar teste…</button>}
            </div>
          </details>
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
          <div style={{ display: 'grid', gap: 8 }}>
            {(open_ || focus) && (
              <div className="selection fade-in">
                <span>{focus ? <>Em foco: <b>{nameOf2(focus)}</b> · <a href={profile(focus)}>perfil e contato →</a></> : <>Destacando <b>{open_!.label}</b> ({open_!.ids.length})</>}</span>
                <button className="secondary" onClick={() => { setGroup(null); focusOn(null); }}>Limpar seleção</button>
              </div>
            )}
            <Map checkpoints={checkpoints} participants={participants} alerts={open} now={now} path={path}
              focus={focus} highlight={highlight} onSelect={(uid) => focusOn(uid)} profileHref={profile} />
          </div>
          <div className="side">
            <div className="kpis">
              <a className="kpi ok link" href={`#/evento/${id}/participantes/f-tracking`} title="Ver quem está ativo"><b>{stats.tracking}</b>Ativos</a>
              <a className="kpi warn link" href={`#/evento/${id}/participantes/f-stale`} title="Ver quem está sem sinal"><b>{stats.stale}</b>Sem sinal</a>
              <a className="kpi link" href={`#/evento/${id}/participantes/f-completed`} title="Ver quem concluiu"><b>{stats.finished}</b>Finalizados</a>
            </div>

            <div className="card">
              <h3>Onde está o grupo</h3>
              {crowd.majority ? (
                <p className="headline"><b>{Math.round(crowd.majority.share * 100)}%</b> entre {crowd.majority.label}</p>
              ) : (
                <p className="muted">{checkpoints.length < 2 ? 'Cadastre o percurso para ver a distribuição.' : 'Sem posições ativas.'}</p>
              )}
              {crowd.segments.map((s) => {
                const key = `seg:${s.label}`;
                return (
                  <div key={s.label}>
                    <button className={`bar-row clickable-row ${group === key ? 'active' : ''}`} onClick={() => toggle(key)} disabled={!s.count}
                      aria-expanded={group === key} title={s.count ? 'Ver quem está neste trecho' : 'Ninguém neste trecho'}>
                      <span>{s.label}</span>
                      <div className="bar"><i style={{ width: `${(s.count / maxSeg) * 100}%` }} /></div>
                      <b>{s.count}</b>
                    </button>
                    {group === key && <PeopleList ids={s.user_ids} nameOf={nameOf2} focus={focus} onFocus={focusOn} profile={profile} />}
                  </div>
                );
              })}
            </div>

            <div className="card">
              <h3>Atenção</h3>
              <div className="chips" style={{ marginBottom: 8 }}>
                {(Object.keys(REASON) as (keyof typeof REASON)[]).map((r) => {
                  const key = `out:${r}`, n = groups[key].ids.length;
                  return <button key={r} className={`chip ${group === key ? 'active' : ''} ${n ? 'hot' : ''}`} disabled={!n} onClick={() => toggle(key)}>{REASON[r]} <b>{n}</b></button>;
                })}
              </div>
              {group?.startsWith('out:') && <PeopleList ids={groups[group].ids} nameOf={nameOf2} focus={focus} onFocus={focusOn} profile={profile}
                detail={(uid) => crowd.outliers.find((o) => o.user_id === uid && `out:${o.reason}` === group)?.detail} />}
              {!crowd.attention.length && <p className="muted">Ninguém fora do padrão.</p>}
              {!group?.startsWith('out:') && crowd.attention.map((a) => (
                <button key={a.user_id} className={`attention ${a.reason} clickable-row ${focus === a.user_id ? 'active' : ''}`} onClick={() => focusOn(a.user_id)} title="Mostrar no mapa">
                  <b>{a.name}</b><span>{REASON[a.reason]} · {a.detail}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'participantes' && <PeopleTab sessionId={id} path={path} participants={participants} alerts={alerts} checkpoints={checkpoints} now={now} onChanged={() => void reload()} extra={extra} />}

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
                  <td><a href={profile(a.user_id)} title="Perfil e contato">{nameOf(a.user_id)}</a></td>
                  <td>{fmtTime(a.created_at)}</td>
                  <td>{a.lat != null ? <a href={`#/evento/${id}/monitor/${a.user_id}`} title="Ver no mapa do evento">{a.lat.toFixed(5)}, {a.lng!.toFixed(5)}</a> : '—'}</td>
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

      {tab === 'percurso' && <RouteEditor sessionId={id} initial={checkpoints} onSaved={(c) => { setCheckpoints(c); void reload(); }} status={session.status} path={path} />}
    </>
  );
}

/** Lista de pessoas de um grupo: clicar foca no mapa; link abre perfil e contato. */
function PeopleList({ ids, nameOf, focus, onFocus, profile, detail }: {
  ids: string[]; nameOf: (uid: string) => string; focus: string | null; onFocus: (uid: string) => void; profile: (uid: string) => string; detail?: (uid: string) => string | undefined;
}) {
  if (!ids.length) return <p className="muted">Ninguém.</p>;
  return (
    <ul className="people-list fade-in">
      {ids.map((uid) => (
        <li key={uid} className={focus === uid ? 'active' : ''}>
          <button className="linkish" onClick={() => onFocus(uid)} title="Mostrar no mapa">{nameOf(uid)}</button>
          {detail?.(uid) && <span className="muted"> · {detail(uid)}</span>}
          <a href={profile(uid)} title="Perfil e contato">perfil</a>
        </li>
      ))}
    </ul>
  );
}
