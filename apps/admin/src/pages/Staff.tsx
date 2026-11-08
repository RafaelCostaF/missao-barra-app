import { useEffect, useState, type FormEvent } from 'react';
import { isEmail } from '@mb/core';
import { api, run } from '../lib';

type Member = { id: string; display_name: string; email: string };

/** Equipe da organização: quem acessa o painel. Promove pelo e-mail de uma conta já cadastrada no app. */
export function Staff() {
  const [staff, setStaff] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [me, setMe] = useState('');
  const [changes, setChanges] = useState<Awaited<ReturnType<typeof api.roleChanges>>>([]);
  const load = () => Promise.all([
    run('admin.staff', api.staff).then((s) => s && setStaff(s)),
    api.roleChanges().then(setChanges).catch(() => undefined),
  ]);
  useEffect(() => {
    void load();
    void api.me().then(setMe);
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) return alert('Informe um e-mail válido.');
    if (await run('admin.staff_add', () => api.setStaff(email, true)) !== undefined) {
      setEmail('');
      await load();
    }
  }

  return (
    <>
      <form className="card row fade-in" onSubmit={add}>
        <h2 style={{ width: '100%' }}>Equipe da organização</h2>
        <p className="muted" style={{ width: '100%', margin: 0 }}>Só organizadores concedem acesso. A pessoa precisa ter conta no app (ou use a página Pessoas). Organizadores veem localização, contatos e logs de todos os eventos oficiais.</p>
        <input type="email" placeholder="E-mail da conta" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, minWidth: 220 }} required />
        <button>Adicionar →</button>
      </form>
      <div className="card scroll fade-in">
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th></th></tr></thead>
          <tbody>
            {staff.map((m) => (
              <tr key={m.id}>
                <td><b>{m.display_name}</b>{m.id === me && <span className="muted"> (você)</span>}</td>
                <td>{m.email}</td>
                <td>{m.id !== me && (
                  <button className="secondary" onClick={async () => {
                    if (confirm(`Remover ${m.display_name} da equipe?`)) {
                      await run('admin.staff_remove', () => api.setStaff(m.email, false));
                      await load();
                    }
                  }}>Remover</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card fade-in">
        <h3>Histórico de permissões</h3>
        {!changes.length && <p className="muted">Nenhuma mudança registrada.</p>}
        <ul className="feed">
          {changes.map((c, i) => (
            <li key={i}><span className="muted">{new Date(c.at).toLocaleString('pt-BR')}</span> <b>{c.user_name}</b> {c.role === 'admin' ? 'virou organizador' : 'deixou a organização'}{c.actor_name ? ` · por ${c.actor_name}` : ' · pelo sistema'}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
