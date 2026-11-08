import { useState, type FormEvent } from 'react';
import { api, logger } from '../lib';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.signIn(email, password);
    } catch (err) {
      void logger.warn('auth.error', { reason: (err as Error).message });
      setError('E-mail ou senha inválidos.');
    }
  }

  return (
    <main style={{ maxWidth: 420, marginTop: '10vh' }}>
      <form className="card" onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <div className="login-brand">
          <img src={`${import.meta.env.BASE_URL}icon-512.png`} alt="" width={72} height={72} />
          <div>
            <span className="kicker">Painel da organização</span>
            <h1>Missão Barra</h1>
            <span className="motto">Missão dada é Missão Barra!</span>
          </div>
        </div>
        <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <div className="form-error" role="alert">{error}</div>}
        <button>Entrar →</button>
      </form>
    </main>
  );
}
