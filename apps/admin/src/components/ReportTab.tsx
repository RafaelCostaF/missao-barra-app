import { useEffect, useState } from 'react';
import { fmtDuration, pace, reportKpis, toCsv, type Alert, type Checkpoint, type ParticipantSummary } from '@mb/core';
import { api, download, fmtTime, run } from '../lib';
import { Modal } from './Modal';
import { EVENT_LABEL, Timeline } from './Timeline';

/** Relatório para análise posterior e auditoria: indicadores do evento, funil por ponto e linha do tempo por pessoa. */
export function ReportTab({ sessionId, alerts, checkpoints }: { sessionId: string; alerts: Alert[]; checkpoints: Checkpoint[] }) {
  const [rows, setRows] = useState<ParticipantSummary[] | null>(null);
  const [person, setPerson] = useState<ParticipantSummary | null>(null);
  const [openCp, setOpenCp] = useState<string | null>(null);
  useEffect(() => void run('admin.report', () => api.report(sessionId)).then((r) => setRows(r ?? [])), [sessionId]);

  if (!rows) return <div className="card skeleton">Carregando relatório…</div>;
  const k = reportKpis(rows, alerts, checkpoints);
  const maxReach = Math.max(1, ...k.funnel.map((f) => f.reached));

  function exportCsv() {
    download(`relatorio-${sessionId}.csv`, toCsv(rows!.map((r) => ({
      nome: r.display_name, status: r.status, inicio: r.started_at, fim: r.finished_at, duracao_s: r.duration_s,
      distancia_m: Math.round(r.distance_m), ajuda: r.alerts_help, emergencia: r.alerts_emergency, sinal_perdido: r.alerts_signal_lost,
      maior_sem_sinal_s: r.max_gap_s, posicoes: r.positions,
      ...Object.fromEntries(checkpoints.map((c) => [`t_${c.name}`, r.passages.find((p) => p.name === c.name)?.elapsed_s ?? ''])),
    }))));
  }

  return (
    <div className="fade-in" style={{ display: 'grid', gap: 16 }}>
      <div className="kpis kpis-5">
        <div className="kpi"><b>{k.participants}</b>Participantes</div>
        <div className="kpi ok"><b>{Math.round(k.completionRate * 100)}%</b>Concluíram</div>
        <div className="kpi"><b>{fmtDuration(k.medianFinishS)}</b>Tempo mediano</div>
        <div className="kpi warn"><b>{k.calls}</b>Chamados · {k.callsPerPerson.toFixed(2)}/pessoa</div>
        <div className="kpi"><b>{fmtDuration(k.medianResolutionS)}</b>Resposta mediana</div>
      </div>

      <div className="card">
        <h3>Avanço por ponto de apoio</h3>
        {!k.funnel.length && <p className="muted">Sem percurso cadastrado.</p>}
        {k.funnel.length > 0 && <p className="muted" style={{ marginTop: -6 }}>Clique num ponto para ver quem passou e quem ainda não passou.</p>}
        {k.funnel.map((f) => {
          const isOpen = openCp === f.name;
          const byId = (uid: string) => rows.find((r) => r.user_id === uid)!;
          return (
            <div key={f.name}>
              <button className={`bar-row funnel clickable-row ${isOpen ? 'active' : ''}`} onClick={() => setOpenCp(isOpen ? null : f.name)} aria-expanded={isOpen} title={`${f.reached} chegaram`}>
                <span>km {f.km} · {f.name}</span>
                <div className="bar"><i style={{ width: `${(f.reached / maxReach) * 100}%` }} /></div>
                <b>{f.reached}</b>
                <span className="muted">{fmtDuration(f.medianElapsedS)}</span>
              </button>
              {isOpen && (
                <div className="funnel-detail fade-in">
                  <div>
                    <h4>Passaram ({f.reachedBy.length}) · mais rápido primeiro</h4>
                    <ul className="people-list">
                      {f.reachedBy.map((h, i) => (
                        <li key={h.user_id}>
                          <span className="muted">{i + 1}º</span>
                          <button className="linkish" onClick={() => setPerson(byId(h.user_id))}>{byId(h.user_id).display_name}</button>
                          <span className="muted">{fmtDuration(h.elapsed_s)}</span>
                          <a href={`#/evento/${sessionId}/monitor/${h.user_id}`}>mapa</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>Ainda não passaram ({f.missing.length})</h4>
                    {!f.missing.length && <p className="muted">Todos passaram.</p>}
                    <ul className="people-list">
                      {f.missing.map((uid) => (
                        <li key={uid}>
                          <button className="linkish" onClick={() => setPerson(byId(uid))}>{byId(uid).display_name}</button>
                          <span className="muted">{byId(uid).status === 'tracking' ? 'em percurso' : 'finalizou antes'}</span>
                          <a href={`#/evento/${sessionId}/participantes/${uid}`}>perfil</a>
                          <a href={`#/evento/${sessionId}/monitor/${uid}`}>mapa</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card scroll">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Por participante ({rows.length})</h3>
          <button className="secondary" onClick={exportCsv}>Exportar CSV</button>
        </div>
        <table>
          <thead><tr><th>Nome</th><th>Status</th><th>Início</th><th>Duração</th><th>Distância</th><th>Ritmo</th><th>Chamados</th><th>Maior sem sinal</th><th>Pontos</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="clickable" onClick={() => setPerson(r)}>
                <td><b>{r.display_name}</b></td>
                <td>{r.status === 'tracking' ? 'Em percurso' : 'Finalizou'}</td>
                <td>{fmtTime(r.started_at)}</td>
                <td>{fmtDuration(r.duration_s)}</td>
                <td>{(r.distance_m / 1000).toFixed(1)} km</td>
                <td>{pace(r.duration_s, r.distance_m)}</td>
                <td>{r.alerts_help + r.alerts_emergency ? `${r.alerts_help} ajuda · ${r.alerts_emergency} emerg.` : '—'}</td>
                <td>{fmtDuration(r.max_gap_s)}</td>
                <td>{r.passages.length}/{checkpoints.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted">Ninguém iniciou o percurso ainda.</p>}
      </div>

      {person && (
        <Modal label={`Linha do tempo de ${person.display_name}`} onClose={() => setPerson(null)}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2>{person.display_name}</h2>
              <button className="secondary" onClick={() => setPerson(null)} aria-label="Fechar">×</button>
            </div>
            <p className="row"><a className="btn" href={`#/evento/${sessionId}/participantes/${person.user_id}`}>Perfil e contato</a><a className="btn secondary" href={`#/evento/${sessionId}/monitor/${person.user_id}`}>Ver no mapa</a></p>
            <p className="muted">{fmtDuration(person.duration_s)} · {(person.distance_m / 1000).toFixed(1)} km · {pace(person.duration_s, person.distance_m)} · maior tempo sem sinal {fmtDuration(person.max_gap_s)}</p>
            <Timeline sessionId={sessionId} userId={person.user_id} passages={person.passages} alerts={alerts.filter((a) => a.user_id === person.user_id)} />
        </Modal>
      )}
    </div>
  );
}
