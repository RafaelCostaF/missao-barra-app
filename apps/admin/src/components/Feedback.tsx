import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';

/** Avisos (toasts) e confirmações do painel, no lugar das caixas nativas do navegador. */
type Toast = { id: number; text: string; kind: 'ok' | 'error' | 'info' };
type Ask = {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  /** Exige digitar este texto para liberar o botão (ações irreversíveis). */
  typeToConfirm?: string;
  resolve: (ok: boolean) => void;
};

let toasts: Toast[] = [];
let ask: Ask | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, kind: Toast['kind'] = 'ok') {
  const id = ++seq;
  toasts = [...toasts, { id, text, kind }].slice(-4);
  emit();
  setTimeout(() => dismiss(id), kind === 'error' ? 9000 : 4000);
}
const dismiss = (id: number) => { toasts = toasts.filter((t) => t.id !== id); emit(); };

/** Confirmação com a consequência escrita; resolve true se a pessoa confirmar. */
export function confirmDialog(o: Omit<Ask, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    ask?.resolve(false);
    ask = { ...o, resolve };
    emit();
  });
}

export function FeedbackHost() {
  const [, render] = useState(0);
  const [typed, setTyped] = useState('');
  const confirmBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const l = () => render((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  const current = ask;
  useEffect(() => { setTyped(''); if (current && !current.typeToConfirm) confirmBtn.current?.focus(); }, [current]);

  const answer = (ok: boolean) => {
    current?.resolve(ok);
    ask = null;
    emit();
  };
  const locked = !!current?.typeToConfirm && typed.trim().toLowerCase() !== current.typeToConfirm.trim().toLowerCase();

  return (
    <>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span>{t.text}</span>
            <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="Fechar aviso">×</button>
          </div>
        ))}
      </div>
      {current && (
        <Modal label={current.title} onClose={() => answer(false)}>
          <h2>{current.title}</h2>
          {current.body && <p>{current.body}</p>}
          {current.typeToConfirm && (
            <label className="confirm-type">
              Para confirmar, digite <b>{current.typeToConfirm}</b>
              <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Texto de confirmação" />
            </label>
          )}
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="secondary" onClick={() => answer(false)}>Cancelar</button>
            <button ref={confirmBtn} className={current.danger ? 'danger' : ''} disabled={locked} onClick={() => answer(true)}>{current.confirmLabel}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
