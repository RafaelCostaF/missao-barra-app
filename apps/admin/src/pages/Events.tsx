import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@mb/core';
import { api, run } from '../lib';

const STATUS_LABEL: Record<string, string> = { draft: 'Rascunho', published: 'Publicado', live: 'Ao vivo', ended: 'Encerrado', archived: 'Arquivado' };

export function Events() {
  const [events, setEvents] = useState<Session[]>([]);
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [isTest, setIsTest] = useState(true);
  const load = () => run('api.all_events', api.allEvents).then((e) => e && setEvents(e));
  useEffect(() => void load(), []);

  async function create(e: FormEvent) {
    e.preventDefault();
    const ev = await run('api.save_event', () => api.saveEvent({ name, starts_at: startsAt ? new Date(startsAt).toISOString() : null, is_test: isTest }));
    if (ev) location.hash = `#/evento/${ev.id}`;
  }

  return (
    <>
      <form className="card row" onSubmit={create}>
        <h2 style={{ width: '100%' }}>Novo evento oficial</h2>
        <input placeholder="Nome (ex.: Missão Barra — 6ª edição)" value={name} onChange={(e) => setName(e.target.value)} required style={{ flex: 2 }} />
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        <label className="row"><input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} /> Sessão de teste</label>
        <button>Criar →</button>
      </form>
      <div className="card scroll">
        <h2>Eventos</h2>
        <table>
          <thead><tr><th>Nome</th><th>Data</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{e.name} {e.is_test && <span className="badge not_started">teste</span>}</td>
                <td>{e.starts_at ? new Date(e.starts_at).toLocaleString('pt-BR') : '—'}</td>
                <td>{STATUS_LABEL[e.status]}</td>
                <td><a href={`#/evento/${e.id}`}>Abrir →</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
