import type { SessionStatus } from '@mb/core';
import { c } from '@/theme';

export const ALERT_LABEL = { emergency: 'Emergência', help: 'Pedido de ajuda', signal_lost: 'Sinal perdido' } as const;
export const STATUS_LABEL: Record<SessionStatus, string> = { draft: 'Rascunho', published: 'Publicado', live: 'Ao vivo', ended: 'Encerrado', archived: 'Arquivado' };
export const statusColor = (s: SessionStatus) => ({ draft: c.inkSoft, published: c.orangeDark, live: c.ok, ended: c.charcoal, archived: c.inkSoft })[s];
export const EVENT_LABEL: Record<string, string> = {
  invited: 'Convidado', accepted: 'Entrou', declined: 'Recusou', tracking: 'Iniciou o percurso', finished: 'Finalizou',
  sharing_on: 'Ligou o compartilhamento', sharing_off: 'Desligou o compartilhamento',
};
export const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
export const ago = (iso: string | null, now: number) => {
  if (!iso) return '—';
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  return min < 1 ? 'agora' : min < 60 ? `há ${min} min` : `há ${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
};
