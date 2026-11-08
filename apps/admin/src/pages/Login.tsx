import { useState, type FormEvent } from 'react';
import { isEmail } from '@mb/core';
import { api, logger, PANEL_URL } from '../lib';
import { toast } from '../components/Feedback';

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
        <button type="button" className="linkish forgot" onClick={async () => {
          if (!isEmail(email)) return setError('Digite seu e-mail acima e toque de novo em "Esqueci minha senha".');
          try {
            await api.resetPassword(email, PANEL_URL);
            setError('');
            toast(`Enviamos um link para ${email}. Abra o e-mail para criar uma nova senha.`);
          } catch (err) {
            setError(`Não foi possível enviar: ${(err as Error).message}`);
          }
        }}>Esqueci minha senha</button>
      </form>
    </main>
  );
}
