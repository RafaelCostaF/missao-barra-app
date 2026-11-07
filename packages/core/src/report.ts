import type { SessionStatus } from './types';
import { getSignalState } from './signal';

/** Resumo do evento para o painel: ativos, desatualizados, finalizados e alertas abertos. */
export function summarize(
  participants: { status: string; last_at: string | null }[],
  alerts: { type: string; resolved_at: string | null }[],
  now = Date.now(),
) {
  const counts = { tracking: 0, stale: 0, finished: 0, not_started: 0 };
  for (const p of participants) counts[getSignalState(p as never, now)]++;
  const open = alerts.filter((a) => !a.resolved_at);
  return {
    ...counts,
    total: participants.length,
    openAlerts: open.length,
    emergencies: open.filter((a) => a.type === 'emergency').length,
  };
}

/** CSV (RFC 4180) para exportar logs e participantes. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap(Object.keys))];
  const cell = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}

/** Ações de ciclo de vida do evento disponíveis em cada estado. */
export const SESSION_ACTIONS: Record<SessionStatus, { to: SessionStatus; label: string }[]> = {
  draft: [{ to: 'published', label: 'Publicar' }],
  published: [{ to: 'live', label: 'Iniciar evento' }, { to: 'draft', label: 'Despublicar' }],
  live: [{ to: 'ended', label: 'Encerrar evento' }],
  ended: [{ to: 'archived', label: 'Arquivar' }],
  archived: [],
};
