import { analyzeCrowd } from './crowd';
import { getSignalState } from './signal';
import type { Alert, LiveParticipant } from './api';
import type { ParticipantSummary } from './audit';
import type { Checkpoint } from './types';

export interface Contact {
  user_id: string;
  phone: string | null;
  phone_verified_at?: string | null;
  photo_path?: string | null;
  health_notes?: string | null;
  registration_number: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
}

/** Filtros da aba Participantes: cada pessoa pode estar em vários. */
export const PERSON_FILTERS = {
  all: 'Todos',
  tracking: 'Monitorando',
  stale: 'Sem sinal',
  open_call: 'Chamado aberto',
  off_route: 'Fora do percurso',
  behind: 'Retardatário',
  not_completed: 'Não concluiu',
  completed: 'Concluiu',
  finished: 'Finalizou',
  not_started: 'Não iniciou',
  low_battery: 'Bateria baixa',
} as const;

/** Abaixo disso o celular pode desligar antes da chegada. */
export const LOW_BATTERY = 20;
export type PersonFilter = keyof typeof PERSON_FILTERS;

export interface Person extends LiveParticipant {
  flags: Set<PersonFilter>;
  passed: number;
  contact?: Contact;
}

/**
 * Junta posição ao vivo, relatório (passagens), alertas e contato numa linha por pessoa.
 * "Não concluiu" = finalizou/encerrou sem passar pelo último ponto de apoio.
 */
export function classifyPeople(
  live: LiveParticipant[], report: ParticipantSummary[], alerts: Pick<Alert, 'user_id' | 'resolved_at'>[],
  checkpoints: Checkpoint[], contacts: Contact[] = [], now = Date.now(),
): Person[] {
  const last = [...checkpoints].sort((a, b) => b.km - a.km)[0];
  const { outliers } = analyzeCrowd(live, checkpoints, now);
  const offRoute = new Set(outliers.filter((a) => a.reason === 'off_route').map((a) => a.user_id));
  const behind = new Set(outliers.filter((a) => a.reason === 'behind').map((a) => a.user_id));
  const openCall = new Set(alerts.filter((a) => !a.resolved_at).map((a) => a.user_id));
  const byUser = new Map(report.map((r) => [r.user_id, r]));
  const contactOf = new Map(contacts.map((c) => [c.user_id, c]));

  return live.map((p) => {
    const passages = byUser.get(p.user_id)?.passages ?? [];
    const completed = !!last && passages.some((x) => x.name === last.name);
    const signal = getSignalState(p as never, now);
    const flags = new Set<PersonFilter>(['all']);
    if (signal === 'tracking') flags.add('tracking');
    if (signal === 'stale') flags.add('stale');
    if (signal === 'not_started') flags.add('not_started');
    if (openCall.has(p.user_id)) flags.add('open_call');
    if (p.status === 'tracking' && p.battery != null && p.battery <= LOW_BATTERY) flags.add('low_battery');
    if (offRoute.has(p.user_id)) flags.add('off_route');
    if (behind.has(p.user_id)) flags.add('behind');
    if (p.status === 'finished') flags.add('finished');
    if (completed) flags.add('completed');
    else if (p.status === 'finished') flags.add('not_completed');
    return { ...p, flags, passed: passages.length, contact: contactOf.get(p.user_id) };
  });
}

/** Busca por nome, nº de inscrição ou celular (ignora acentos e pontuação). */
export function matchesPerson(p: Person, q: string) {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const digits = (s: string) => s.replace(/\D/g, '');
  const term = norm(q.trim());
  if (!term) return true;
  if (norm(p.display_name).includes(term) || norm(p.contact?.registration_number ?? '').includes(term)) return true;
  return digits(term).length >= 3 && digits(p.contact?.phone ?? '').includes(digits(term));
}

/** Links de contato para uso em campo (ligar, WhatsApp, abrir posição no mapa). */
export const telLink = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
export function whatsappLink(phone: string) {
  let d = phone.replace(/\D/g, '');
  if (d.length <= 11) d = `55${d}`; // número brasileiro sem DDI
  return `https://wa.me/${d}`;
}
export const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
