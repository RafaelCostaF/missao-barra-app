import { useEffect, useState } from 'react';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { api, supabase } from './lib';
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
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [page, id, sub, extra] = useHash();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setAuth(s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (auth) api.profile().then((p) => setIsAdmin(p.role === 'admin')).catch(() => setIsAdmin(false));
    else setIsAdmin(null);
  }, [auth?.user.id]);

  if (auth === undefined) return null;
  if (!auth) return <Login />;
  if (isAdmin === false)
    return <main><div className="card">Esta conta não tem permissão de administrador. <button onClick={() => api.signOut()}>Sair</button></div></main>;
  if (isAdmin === null) return null;

  return (
    <>
      <header>
        <a className="brand" href="#/eventos"><img src={`${import.meta.env.BASE_URL}icon-512.png`} alt="" width={28} height={28} />MB<span className="full"> · Missão Barra</span></a>
        <a href="#/eventos">Eventos</a>
        <a href="#/pessoas">Pessoas</a>
        <a href="#/equipe">Equipe</a>
        <a href="#/logs">Logs</a>
        <AlertCenter />
        <button className="secondary" style={{ color: 'var(--white)', borderColor: 'var(--white)' }} onClick={() => api.signOut()}>Sair</button>
      </header>
      <main>
        {page === 'evento' && id ? <EventDetail key={id} id={id} tab={sub} extra={extra} /> : page === 'logs' ? <Logs /> : page === 'equipe' ? <Staff /> : page === 'pessoas' ? <People /> : <Events />}
      </main>
    </>
  );
}
