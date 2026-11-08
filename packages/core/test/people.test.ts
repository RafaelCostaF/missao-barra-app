import { describe, expect, it } from 'vitest';
import { classifyPeople, matchesPerson, mapsLink, telLink, whatsappLink, type Checkpoint, type LiveParticipant, type ParticipantSummary } from '../src';

const now = Date.parse('2026-12-06T12:00:00Z');
const KM = 1 / (111.32 * Math.cos((13 * Math.PI) / 180));
const cps = [0, 20].map((km, i) => ({ id: `${i}`, session_id: 's', name: ['Largada', 'Chegada'][i], km, lat: -13, lng: -38.3 - km * KM, kind: 'stop' })) as Checkpoint[];
const live = (id: string, o: Partial<LiveParticipant> = {}): LiveParticipant => ({
  session_id: 's', user_id: id, display_name: id, status: 'tracking', sharing: true, distance_m: 0,
  last_at: '2026-12-06T11:59:50Z', last_lat: -13, last_lng: -38.3 - 5 * KM, ...o,
});
const rep = (id: string, names: string[]) => ({ user_id: id, passages: names.map((name) => ({ name, km: 0, at: '', elapsed_s: 0 })) }) as unknown as ParticipantSummary;

describe('classifyPeople', () => {
  const people = classifyPeople(
    [
      live('Ana Souza'),
      live('Bia', { last_at: '2026-12-06T11:40:00Z' }),
      live('Caio', { status: 'finished' }),
      live('Duda', { status: 'finished' }),
      live('Edu', { status: 'accepted', last_at: null, last_lat: null, last_lng: null }),
      live('Fábio', { last_lat: -13.02 }),
      live('Gil', { battery: 12 }),
    ],
    [rep('Caio', ['Largada', 'Chegada']), rep('Duda', ['Largada'])],
    [{ user_id: 'Bia', resolved_at: null }, { user_id: 'Ana Souza', resolved_at: '2026-12-06T11:00:00Z' }],
    cps,
    [{ user_id: 'Ana Souza', phone: '(71) 99999-0001', registration_number: 'MB-0042', emergency_name: null, emergency_phone: null }],
    now,
  );
  const who = (f: string) => people.filter((p) => p.flags.has(f as never)).map((p) => p.user_id);

  it('separa por situação para rastrear um a um', () => {
    expect(who('stale')).toEqual(['Bia']);
    expect(who('open_call')).toEqual(['Bia']);
    expect(who('completed')).toEqual(['Caio']);
    expect(who('not_completed')).toEqual(['Duda']);
    expect(who('not_started')).toEqual(['Edu']);
    expect(who('off_route')).toEqual(['Fábio']);
    expect(who('low_battery')).toEqual(['Gil']);
    expect(who('all')).toHaveLength(7);
  });
  it('busca por nome sem acento, inscrição ou celular', () => {
    const ana = people.find((p) => p.user_id === 'Ana Souza')!;
    expect(matchesPerson(ana, 'souza')).toBe(true);
    expect(matchesPerson(ana, 'mb-0042')).toBe(true);
    expect(matchesPerson(ana, '99999')).toBe(true);
    expect(matchesPerson(people.find((p) => p.user_id === 'Fábio')!, 'fabio')).toBe(true);
    expect(matchesPerson(ana, 'bia')).toBe(false);
  });
  it('links de contato', () => {
    expect(telLink('(71) 99999-0001')).toBe('tel:71999990001');
    expect(whatsappLink('(71) 99999-0001')).toBe('https://wa.me/5571999990001');
    expect(whatsappLink('+55 71 99999-0001')).toBe('https://wa.me/5571999990001');
    expect(mapsLink(-13, -38.5)).toContain('query=-13,-38.5');
  });
});

describe('retardatário vira filtro', () => {
  it('quem está bem atrás do grupo ganha a marca behind', () => {
    const group = [12, 12.5, 13, 13.5, 14].map((k, i) => live(`g${i}`, { last_lng: -38.3 - k * KM }));
    const people = classifyPeople([...group, live('lento', { last_lng: -38.3 - 3 * KM })], [], [], cps, [], now);
    expect(people.filter((x) => x.flags.has('behind')).map((x) => x.user_id)).toEqual(['lento']);
  });
});
