import type { AlertType } from './types';

export interface Notice {
  kind: 'friend_request' | 'friend_accepted' | 'invite' | 'alert' | 'participation';
  title: string;
  body: string;
  urgent?: boolean;
}

/** Evento do Supabase Realtime (postgres_changes). */
export interface Change {
  table: 'friendships' | 'participants' | 'alerts';
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, any>;
  old: Record<string, any>;
}

const ALERT_TEXT: Record<AlertType, [string, string]> = {
  emergency: ['EMERGÊNCIA', 'acionou emergência'],
  help: ['Pedido de ajuda', 'precisa de ajuda'],
  signal_lost: ['Sinal perdido', 'está sem enviar localização há mais de 10 min'],
};

/**
 * Traduz mudanças do banco em avisos para o usuário `me`; null = nada a mostrar.
 * `participation`: avisar início/fim de percurso (só para quem gerencia a sessão, ex.: painel).
 */
export function toNotice(c: Change, me: string, nameOf: (userId: string) => string, opts: { participation?: boolean } = {}): Notice | null {
  const n = c.new;
  if (c.table === 'friendships') {
    if (c.eventType === 'INSERT' && n.addressee === me && n.status === 'pending')
      return { kind: 'friend_request', title: 'Solicitação de amizade', body: `${nameOf(n.requester)} quer ser seu amigo na Missão Barra.` };
    if (c.eventType === 'UPDATE' && n.requester === me && n.status === 'accepted' && c.old.status !== 'accepted')
      return { kind: 'friend_accepted', title: 'Amizade aceita', body: `${nameOf(n.addressee)} aceitou seu pedido.` };
  }
  if (c.table === 'participants' && c.eventType === 'INSERT' && n.user_id === me && n.status === 'invited')
    return { kind: 'invite', title: 'Convite para corrida', body: 'Você foi convidado para uma corrida entre amigos.' };
  if (opts.participation && c.table === 'participants' && c.eventType === 'UPDATE' && n.user_id !== me && n.status !== c.old.status) {
    if (n.status === 'tracking') return { kind: 'participation', title: 'Iniciou o percurso', body: `${nameOf(n.user_id)} começou a ser monitorado.` };
    if (n.status === 'finished') return { kind: 'participation', title: 'Finalizou', body: `${nameOf(n.user_id)} finalizou a participação.` };
  }
  if (c.table === 'alerts' && c.eventType === 'INSERT' && n.user_id !== me) {
    const [title, verb] = ALERT_TEXT[n.type as AlertType];
    return { kind: 'alert', title, body: `${nameOf(n.user_id)} ${verb}.`, urgent: n.type === 'emergency' };
  }
  return null;
}

/**
 * Realtime não envia o status anterior em tabelas com RLS (`old` só traz a chave).
 * Guarda o último status visto por participante e o injeta em `old`, para avisar só mudanças reais.
 */
export function createStatusCache(initial: { session_id: string; user_id: string; status: string }[] = []) {
  const last = new Map(initial.map((p) => [`${p.session_id}:${p.user_id}`, p.status]));
  return (c: Change): Change => {
    if (c.table !== 'participants' || c.eventType === 'DELETE') return c;
    const key = `${c.new.session_id}:${c.new.user_id}`;
    const prev = last.get(key) ?? (c.eventType === 'INSERT' ? undefined : c.new.status); // desconhecido = sem mudança
    last.set(key, c.new.status);
    return { ...c, old: { ...c.old, status: prev } };
  };
}
