import { useCallback, useEffect, useState } from 'react';
import { helpInbox, type Alert, type HelpMessage, type LiveParticipant } from '@mb/core';
import { api, fmtTime, supabase } from '../lib';
import { HelpChat } from './HelpChat';

const OPEN = { emergency: ['Emergência', 'alert-emergency'], help: ['Ajuda aberta', 'alert-help'] } as const;

/** Atendimentos do evento: lista de conversas/alertas à esquerda, conversa à direita. Perfil só por link explícito. */
export function HelpInbox({ sessionId, selected, participants, alerts, onChanged }: {
  sessionId: string; selected?: string; participants: LiveParticipant[]; alerts: Alert[]; onChanged: () => void;
}) {
  const [msgs, setMsgs] = useState<HelpMessage[]>([]);
  const [me, setMe] = useState('');
  const load = useCallback(() => api.helpMessages(sessionId).then(setMsgs).catch(() => undefined), [sessionId]);
  useEffect(() => {
    void api.me().then(setMe);
    void load();
    const ch = api.subscribe(`inbox:${sessionId}`, ['help_messages'], () => void load(), `session_id=eq.${sessionId}`);
    return () => void supabase.removeChannel(ch);
  }, [sessionId, load]);

  const inbox = helpInbox(msgs, alerts);
  const nameOf = (uid: string) => participants.find((p) => p.user_id === uid)?.display_name ?? 'Participante';
  const current = selected ? inbox.find((i) => i.user_id === selected) ?? { user_id: selected, last: null, waiting: 0, open: null, lastAt: '' } : null;

  return (
    <div className={`inbox fade-in ${current ? 'has-chat' : ''}`}>
      <div className="card inbox-list">
        <h3>Atendimentos ({inbox.length})</h3>
        {!inbox.length && <p className="muted">Nenhum pedido de ajuda ainda. Quando alguém tocar em Ajuda no app, a conversa aparece aqui.</p>}
        {inbox.map((i) => (
          <a key={i.user_id} href={`#/evento/${sessionId}/atendimentos/${i.user_id}`} className={`inbox-item ${i.user_id === selected ? 'active' : ''} ${i.open ?? 'closed'}`}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>{nameOf(i.user_id)}</b>
              <span className="muted">{i.lastAt ? fmtTime(i.lastAt) : ''}</span>
            </div>
            <span className="preview">{i.last ? i.last.body : 'Sem mensagens (só o alerta)'}</span>
            <span className="row" style={{ gap: 4 }}>
              {i.open && <span className={`badge ${OPEN[i.open][1]}`}>{OPEN[i.open][0]}</span>}
              {i.waiting > 0 && <span className="badge chat-badge">💬 {i.waiting} sem resposta</span>}
              {!i.open && !i.waiting && <span className="badge not_started">Encerrado</span>}
            </span>
          </a>
        ))}
      </div>
      {current && (
        <div className="card inbox-chat">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>{nameOf(current.user_id)}</h2>
            <a className="btn secondary" href="#" onClick={(e) => { e.preventDefault(); location.hash = `#/evento/${sessionId}/atendimentos`; }} aria-label="Fechar conversa">×</a>
          </div>
          <HelpChat sessionId={sessionId} userId={current.user_id} me={me} name={nameOf(current.user_id)} open={current.open} onClosed={() => { void load(); onChanged(); }} />
        </div>
      )}
    </div>
  );
}
