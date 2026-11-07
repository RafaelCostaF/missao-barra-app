import { useEffect, useState } from 'react';
import { toCsv, type LogFilters } from '@mb/core';
import { api, download, run } from '../lib';

type Row = Record<string, any>;

/** Consulta de logs técnicos com filtros e exportação (ver docs/LOGS.md). */
export function Logs() {
  const [f, setF] = useState<LogFilters>({ from: new Date(Date.now() - 86_400_000).toISOString().slice(0, 16) });
  const [rows, setRows] = useState<Row[]>([]);
  const set = (k: keyof LogFilters) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value || undefined });

  const search = async () => {
    const r = await run('admin.logs', () => api.logs({ ...f, from: f.from && new Date(f.from).toISOString(), to: f.to && new Date(f.to).toISOString() }));
    if (r) setRows(r);
  };
  useEffect(() => void search(), []);

  return (
    <>
      <div className="card row">
        <h2 style={{ width: '100%' }}>Logs técnicos</h2>
        <label>De <input type="datetime-local" value={f.from ?? ''} onChange={set('from')} /></label>
        <label>Até <input type="datetime-local" value={f.to ?? ''} onChange={set('to')} /></label>
        <select value={f.level ?? ''} onChange={set('level')}>
          <option value="">Todos os níveis</option>
          {['error', 'warn', 'info', 'debug'].map((l) => <option key={l}>{l}</option>)}
        </select>
        <input placeholder="Evento (prefixo, ex.: gps.)" value={f.event ?? ''} onChange={set('event')} />
        <input placeholder="ID da sessão" value={f.sessionId ?? ''} onChange={set('sessionId')} />
        <input placeholder="Versão do app" value={f.appVersion ?? ''} onChange={set('appVersion')} />
        <button onClick={search}>Filtrar →</button>
        <button className="secondary" onClick={() => download(`logs-${new Date().toISOString()}.csv`, toCsv(rows))}>Exportar CSV</button>
      </div>
      <div className="card scroll">
        <table>
          <thead><tr><th>Hora</th><th>Nível</th><th>Evento</th><th>Sessão</th><th>Versão / SO</th><th>Latência</th><th>Erro / detalhes</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.ts).toLocaleString('pt-BR')}</td>
                <td>{r.level}</td>
                <td>{r.event}</td>
                <td>{r.session_id?.slice(0, 8) ?? '—'}</td>
                <td>{r.app_version} · {r.os} {r.device}</td>
                <td>{r.latency_ms != null ? `${r.latency_ms} ms` : ''}</td>
                <td><code>{r.error}</code> {r.meta && Object.keys(r.meta).length ? <code className="muted">{JSON.stringify(r.meta)}</code> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted">Nenhum log para os filtros.</p>}
      </div>
    </>
  );
}
