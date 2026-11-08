import { useState, type FormEvent } from 'react';
import { passwordProblem } from '@mb/core';
import { api } from '../lib';

/** Página aberta pelo link do e-mail "Esqueci minha senha" (participantes e organizadores). */
export function NewPassword({ hasSession, onDone }: { hasSession: boolean; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(pw) ?? (pw !== pw2 ? 'As duas senhas não são iguais.' : null);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await api.updatePassword(pw);
      await api.signOut(); // volta a entrar com a senha nova (no app ou aqui)
      setDone(true);
    } catch (err) {
      setError(`Não foi possível salvar: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, marginTop: '10vh' }}>
      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div className="login-brand">
          <img src={`${import.meta.env.BASE_URL}icon-512.png`} alt="" width={56} height={56} />
          <div><span className="kicker">Missão Barra</span><h1>Nova senha</h1></div>
        </div>
        {done ? (
          <>
            <p><b>Senha alterada.</b> Volte ao app Missão Barra e entre com a nova senha.</p>
            <button onClick={() => { location.hash = ''; onDone(); }}>Ir para o login →</button>
          </>
        ) : !hasSession ? (
          <>
            <p>Este link expirou ou já foi usado. Peça outro em "Esqueci minha senha", no app ou no login do painel.</p>
            <button onClick={() => { location.hash = ''; onDone(); }}>Voltar</button>
          </>
        ) : (
          <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
            <p className="muted" style={{ margin: 0 }}>Mínimo de 8 caracteres, com letras e números.</p>
            <input type="password" placeholder="Nova senha" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus />
            <input type="password" placeholder="Repita a nova senha" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
            {error && <div className="form-error" role="alert">{error}</div>}
            <button disabled={busy}>Salvar nova senha</button>
          </form>
        )}
      </div>
    </main>
  );
}
