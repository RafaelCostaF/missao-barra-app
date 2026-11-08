import type { HelpMessage } from './api';

/** Respostas rápidas do participante (um toque, mesmo correndo). */
export const QUICK_HELP = ['Câimbra', 'Machuquei', 'Me perdi', 'Preciso de água', 'Passando mal', 'Bateria acabando'] as const;
/** Respostas rápidas da organização. */
export const QUICK_REPLY = ['Equipe a caminho', 'Fique onde está', 'Vamos te ligar', 'Siga até o próximo ponto de apoio'] as const;

/**
 * Conversas com mensagem do participante ainda sem resposta da organização (a última é dele).
 * Devolve user_id → quantidade de mensagens dele depois da última resposta.
 */
export function unanswered(messages: Pick<HelpMessage, 'user_id' | 'sender_id' | 'id'>[]) {
  const out = new Map<string, number>();
  for (const m of [...messages].sort((a, b) => a.id - b.id)) {
    if (m.sender_id === m.user_id) out.set(m.user_id, (out.get(m.user_id) ?? 0) + 1);
    else out.delete(m.user_id);
  }
  return out;
}
