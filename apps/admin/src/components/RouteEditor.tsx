import { useEffect, useState } from 'react';
import type { Checkpoint, CheckpointKind } from '@mb/core';
import { api, run } from '../lib';
import { Map } from './Map';

type Draft = Omit<Checkpoint, 'id' | 'session_id'>;

/** Clique no mapa adiciona ponto de apoio; largada e chegada são o primeiro e o último por km. */
export function RouteEditor({ sessionId, initial, onSaved }: { sessionId: string; initial: Checkpoint[]; onSaved: (c: Checkpoint[]) => void }) {
  const [cps, setCps] = useState<Draft[]>([]);
  useEffect(() => setCps(initial.map(({ name, km, lat, lng, kind }) => ({ name, km, lat, lng, kind }))), [initial]);

  const update = (i: number, patch: Partial<Draft>) => setCps((l) => l.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const add = (lat: number, lng: number) =>
    setCps((l) => [...l, { name: `Ponto ${l.length + 1}`, km: (l.at(-1)?.km ?? -5) + 5, lat, lng, kind: 'stop' }]);

  async function save() {
    const sorted = [...cps].sort((a, b) => a.km - b.km).map((c, i, arr): Draft => ({
      ...c,
      kind: (i === 0 ? 'start' : i === arr.length - 1 ? 'finish' : 'stop') as CheckpointKind,
    }));
    await run('admin.save_checkpoints', () => api.saveCheckpoints(sessionId, sorted), { count: sorted.length });
    onSaved(await api.checkpoints(sessionId));
  }

  return (
    <div className="grid2">
      <Map checkpoints={cps} onClick={add} />
      <div className="card scroll">
        <h3>Pontos de apoio</h3>
        <p className="muted">Clique no mapa para adicionar. Ordem pelo km.</p>
        <table>
          <thead><tr><th>Nome</th><th>km</th><th></th></tr></thead>
          <tbody>
            {cps.map((c, i) => (
              <tr key={i}>
                <td><input value={c.name} onChange={(e) => update(i, { name: e.target.value })} /></td>
                <td><input type="number" step="0.1" style={{ width: 80 }} value={c.km} onChange={(e) => update(i, { km: Number(e.target.value) })} /></td>
                <td><button className="secondary" onClick={() => setCps((l) => l.filter((_, j) => j !== i))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 12 }}><button onClick={save}>Salvar percurso →</button></div>
      </div>
    </div>
  );
}
