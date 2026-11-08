import { useEffect, useState } from 'react';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { api, recoveryAtLoad, supabase } from './lib';
import { NewPassword } from './pages/NewPassword';
import { Login } from './pages/Login';
import { Events } from './pages/Events';
import { EventDetail } from './pages/EventDetail';
import { Logs } from './pages/Logs';
import { Staff } from './pages/Staff';
import { People } from './pages/People';
import { AlertCenter } from './components/AlertCenter';

/** Rotas por hash: #/eventos, #/evento/<id>, #/logs. Sem dependência de roteador. */
function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#\/?/, '').split('/');
}

export function App() {
  const [auth, setAuth] = useState<AuthSession | null | undefined>(undefined);
  const [recovery, setRecovery] = useState(recoveryAtLoad);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [page, id, sub, extra] = useHash();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [page, id, sub]); // fecha o menu ao navegar

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth(data.session));
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'PASSWORD_RECOVERY') setRecovery(true);
      setAuth(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (auth) api.profile().then((p) => setIsAdmin(p.role === 'admin')).catch(() => setIsAdmin(false));
    else setIsAdmin(null);
  }, [auth?.user.id]);

  if (auth === undefined) return null;
  // Link de nova senha vale para qualquer conta (participante ou organizador).
  if (recovery) return <NewPassword hasSession={!!auth} onDone={() => setRecovery(false)} />;
  if (!auth) return <Login />;
  if (isAdmin === false)
    return <main><div className="card">Esta conta não tem permissão de administrador. <button onClick={() => api.signOut()}>Sair</button></div></main>;
  if (isAdmin === null) return null;

  return (
    <>
      <header className={menu ? 'menu-open' : ''}>
        <a className="brand" href="#/eventos"><img src={`${import.meta.env.BASE_URL}icon-512.png`} alt="" width={28} height={28} />MB<span className="full"> · Missão Barra</span></a>
        {/* No celular, alertas ficam sempre visíveis; a navegação vai para o menu ☰. */}
        <AlertCenter />
        <button className="menu-toggle" aria-expanded={menu} aria-controls="nav" aria-label="Menu" onClick={() => setMenu((m) => !m)}>{menu ? '×' : '☰'}</button>
        <nav id="nav" className="nav">
          {[['eventos', 'Eventos'], ['pessoas', 'Pessoas'], ['equipe', 'Equipe'], ['logs', 'Logs']].map(([k, label]) => (
            <a key={k} href={`#/${k}`} className={(page || 'eventos') === k || (k === 'eventos' && page === 'evento') ? 'current' : ''}>{label}</a>
          ))}
          <button className="secondary logout" onClick={() => api.signOut()}>Sair</button>
        </nav>
      </header>
      <main>
        {page === 'evento' && id ? <EventDetail key={id} id={id} tab={sub} extra={extra} /> : page === 'logs' ? <Logs /> : page === 'equipe' ? <Staff /> : page === 'pessoas' ? <People /> : <Events />}
      </main>
    </>
  );
}
