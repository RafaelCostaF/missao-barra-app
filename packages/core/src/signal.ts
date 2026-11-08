import type { Participant } from './types';

export type SignalState = 'not_started' | 'tracking' | 'stale' | 'finished';

/** Sem posição nova há mais que isso → "sinal desatualizado". */
export const STALE_AFTER_MS = 2 * 60_000;

export function getSignalState(
  p: Pick<Participant, 'status' | 'last_at'>,
  now: number = Date.now(),
): SignalState {
  if (p.status === 'finished') return 'finished';
  if (p.status !== 'tracking' || !p.last_at) return 'not_started';
  return now - Date.parse(p.last_at) > STALE_AFTER_MS ? 'stale' : 'tracking';
}

export const SIGNAL_LABEL: Record<SignalState, string> = {
  not_started: 'Não iniciado',
  tracking: 'Monitorando',
  stale: 'Sem sinal',
  finished: 'Finalizado',
};
