import type { Alert, HelpMessage } from './api';

/** Mensagem gravada pelo servidor ao encerrar (close_help); não conta como "sem resposta". */
export const isClosingMessage = (body: string) => /^Atendimento encerrado/.test(body);

/** Respostas rápidas do participante (um toque, mesmo correndo). */
export const QUICK_HELP = ['Câimbra', 'Machuquei', 'Me perdi', 'Preciso de água', 'Passando mal', 'Bateria acabando'] as const;
/** Respostas rápidas da organização. */
export const QUICK_REPLY = ['Equipe a caminho', 'Fique onde está', 'Vamos te ligar', 'Siga até o próximo ponto de apoio'] as const;

/**
 * Conversas com mensagem do participante ainda sem resposta da organização (a última é dele).
 * Devolve user_id → quantidade de mensagens dele depois da última resposta.
 */
export function unanswered(messages: Pick<HelpMessage, 'user_id' | 'sender_id' | 'id' | 'body'>[]) {
  const out = new Map<string, number>();
  for (const m of [...messages].sort((a, b) => a.id - b.id)) {
    if (m.sender_id === m.user_id && !isClosingMessage(m.body)) out.set(m.user_id, (out.get(m.user_id) ?? 0) + 1);
    else out.delete(m.user_id);
  }
  return out;
}

export interface InboxItem {
  user_id: string;
  /** Última mensagem da conversa (null = só alerta, sem mensagem). */
  last: HelpMessage | null;
  /** Mensagens do participante ainda sem resposta. */
  waiting: number;
  /** Atendimento aberto (alerta de emergência/ajuda não resolvido). */
  open: 'emergency' | 'help' | null;
  lastAt: string;
}

/**
 * Caixa de atendimentos da organização: uma linha por pessoa com conversa ou alerta de ajuda/emergência.
 * Ordem: emergência aberta → mensagens sem resposta → ajuda aberta → encerrados (mais recentes primeiro).
 */
export function helpInbox(messages: HelpMessage[], alerts: Pick<Alert, 'user_id' | 'type' | 'resolved_at' | 'created_at'>[]): InboxItem[] {
  const waiting = unanswered(messages);
  const by = new Map<string, InboxItem>();
  const item = (uid: string) => by.get(uid) ?? (by.set(uid, { user_id: uid, last: null, waiting: waiting.get(uid) ?? 0, open: null, lastAt: '' }), by.get(uid)!);
  for (const m of messages) {
    const it = item(m.user_id);
    if (!it.last || m.id > it.last.id) it.last = m;
    if (m.created_at > it.lastAt) it.lastAt = m.created_at;
  }
  for (const a of alerts) {
    if (a.type === 'signal_lost') continue;
    const it = item(a.user_id);
    if (!a.resolved_at && (a.type === 'emergency' || !it.open)) it.open = a.type;
    if (a.created_at > it.lastAt) it.lastAt = a.created_at;
  }
  const rank = (i: InboxItem) => (i.open === 'emergency' ? 0 : i.waiting ? 1 : i.open ? 2 : 3);
  return [...by.values()].sort((a, b) => rank(a) - rank(b) || b.lastAt.localeCompare(a.lastAt));
}
