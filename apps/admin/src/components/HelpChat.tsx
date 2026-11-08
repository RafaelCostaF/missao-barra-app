import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { QUICK_REPLY, type HelpMessage } from '@mb/core';
import { api, fmtTime, runOk, supabase } from '../lib';
import { confirmDialog, toast } from './Feedback';

/** Conversa de ajuda com um participante (organização responde). */
export function HelpChat({ sessionId, userId, me, open, onClosed, name }: {
  sessionId: string; userId: string; me: string;
  /** Nome real do participante (no lugar de "Participante"). */
  name?: string;
  /** Atendimento aberto agora (para mostrar "Encerrar atendimento"). */
  open?: 'emergency' | 'help' | null;
  onClosed?: () => void;
}) {
  const [msgs, setMsgs] = useState<HelpMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const load = useCallback(() => api.helpThread(sessionId, userId).then(setMsgs).catch(() => undefined), [sessionId, userId]);

  useEffect(() => {
    void load();
    const ch = api.subscribe(`help-admin:${sessionId}:${userId}`, ['help_messages'], () => void load(), `user_id=eq.${userId}`);
    const t = setInterval(() => void load(), 20_000);
    return () => {
      clearInterval(t);
      void supabase.removeChannel(ch);
    };
  }, [sessionId, userId, load]);
  // Chaves: scrollIntoView devolve Promise no Chrome recente, e efeito só pode devolver função.
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [msgs.length]);

  async function send(body: string, e?: FormEvent) {
    e?.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    if (await runOk('help.reply', () => api.sendHelp(sessionId, userId, body), { session_id: sessionId })) {
      setText('');
      await load();
    }
    setSending(false);
  }

  async function closeHelp() {
    if (!(await confirmDialog({ title: 'Encerrar atendimento?', body: 'O pedido de ajuda/emergência fica como resolvido e a pessoa vê o aviso na conversa. Se ela escrever de novo, um novo atendimento é aberto.', confirmLabel: 'Encerrar atendimento' }))) return;
    if (await runOk('help.close', () => api.closeHelp(sessionId, userId), { session_id: sessionId })) {
      toast('Atendimento encerrado.');
      await load();
      onClosed?.();
    }
  }

  return (
    <div className="chat">
      <div className="row chat-actions">
        <a className="btn secondary" href={`#/evento/${sessionId}/participantes/${userId}`}>Ver perfil e contato</a>
        {open && <button onClick={() => void closeHelp()}>Encerrar atendimento</button>}
        {open && <span className={`badge ${open === 'emergency' ? 'alert-emergency' : 'alert-help'}`}>{open === 'emergency' ? 'Emergência aberta' : 'Ajuda aberta'}</span>}
      </div>
      <div className="chat-log">
        {!msgs.length && <p className="muted">Nenhuma mensagem. A pessoa abre a conversa pelo botão Ajuda do app.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`bubble ${m.sender_id === me ? 'mine' : m.sender_id === m.user_id ? 'theirs' : 'org'}`}>
            {m.sender_id !== me && <span className="who">{m.sender_id === m.user_id ? name ?? 'Participante' : 'Organização'}</span>}
            <span>{m.body}</span>
            <time>{fmtTime(m.created_at)}</time>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="chips">
        {QUICK_REPLY.map((q) => <button key={q} type="button" className="chip" disabled={sending} onClick={() => void send(q)}>{q}</button>)}
      </div>
      <form className="row" onSubmit={(e) => void send(text, e)}>
        <input className="search" placeholder="Responder…" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label="Mensagem" />
        <button disabled={!text.trim() || sending}>Enviar</button>
      </form>
    </div>
  );
}
