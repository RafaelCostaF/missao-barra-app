import { useEffect, useState } from 'react';
import type { Checkpoint, CheckpointKind, SessionStatus } from '@mb/core';
import { api, runOk } from '../lib';
import { Map } from './Map';
import { confirmDialog, toast } from './Feedback';

type Draft = Omit<Checkpoint, 'id' | 'session_id'>;

/** Clique no mapa adiciona ponto de apoio; largada e chegada são o primeiro e o último por km. */
export function RouteEditor({ sessionId, initial, onSaved, status }: { sessionId: string; initial: Checkpoint[]; onSaved: (c: Checkpoint[]) => void; status: SessionStatus }) {
  const [cps, setCps] = useState<Draft[]>([]);
  const saved = JSON.stringify(initial.map(({ name, km, lat, lng }) => ({ name, km, lat, lng })));
  useEffect(() => setCps(initial.map(({ name, km, lat, lng, kind }) => ({ name, km, lat, lng, kind }))), [initial]);
  const dirty = JSON.stringify(cps.map(({ name, km, lat, lng }) => ({ name, km, lat, lng }))) !== saved;
  const running = status === 'live' || status === 'published';

  // Alterações não salvas: pergunta antes de sair (links do painel e fechar a aba).
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = async (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a || a.getAttribute('href') === location.hash) return;
      e.preventDefault();
      e.stopPropagation();
      if (await confirmDialog({ title: 'Sair sem salvar o percurso?', body: 'As mudanças nos pontos de apoio serão perdidas.', confirmLabel: 'Sair sem salvar', danger: true }))
        location.hash = a.getAttribute('href')!;
    };
    addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      removeEventListener('beforeunload', onUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  const update = (i: number, patch: Partial<Draft>) => setCps((l) => l.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const add = (lat: number, lng: number) =>
    setCps((l) => [...l, { name: `Ponto ${l.length + 1}`, km: (l.at(-1)?.km ?? -5) + 5, lat, lng, kind: 'stop' }]);

  async function save() {
    if (running && !(await confirmDialog({
      title: status === 'live' ? 'Mudar o percurso com o evento ao vivo?' : 'Mudar o percurso de um evento publicado?',
      body: 'Os km, a distribuição pelo trecho e as estimativas de chegada de todos os participantes passam a usar o novo percurso.',
      confirmLabel: 'Salvar percurso',
    }))) return;
    const sorted = [...cps].sort((a, b) => a.km - b.km).map((c, i, arr): Draft => ({
      ...c,
      kind: (i === 0 ? 'start' : i === arr.length - 1 ? 'finish' : 'stop') as CheckpointKind,
    }));
    if (!(await runOk('admin.save_checkpoints', () => api.saveCheckpoints(sessionId, sorted), { count: sorted.length }))) return;
    onSaved(await api.checkpoints(sessionId));
    toast(`Percurso salvo: ${sorted.length} ponto(s) de apoio.`);
  }

  return (
    <div className="grid2">
      <Map checkpoints={cps} onClick={add} />
      <div className="card scroll">
        <h3>Pontos de apoio</h3>
        {running && <p className="warn-box">{status === 'live' ? 'Evento ao vivo' : 'Evento publicado'}: mudanças aqui afetam km e estimativas de todos os participantes.</p>}
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
        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={save} disabled={!dirty}>Salvar percurso</button>
          {dirty ? <span className="unsaved">● Alterações não salvas</span> : <span className="muted">Tudo salvo</span>}
          {dirty && <button className="secondary" onClick={() => setCps(initial.map(({ name, km, lat, lng, kind }) => ({ name, km, lat, lng, kind })))}>Desfazer</button>}
        </div>
      </div>
    </div>
  );
}
