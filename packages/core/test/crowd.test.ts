import { describe, expect, it } from 'vitest';
import { analyzeCrowd, type Checkpoint, type LiveParticipant } from '../src';

const now = Date.parse('2026-12-06T10:00:00Z');
// Rota reta para oeste ao longo da latitude -13 (1 km ≈ 0,00924° de longitude).
const KM = 1 / (111.32 * Math.cos((13 * Math.PI) / 180));
const cps = [0, 10, 20].map((km, i) => ({ id: `${i}`, session_id: 's', name: ['A', 'B', 'C'][i], km, lat: -13, lng: -38.3 - km * KM, kind: 'stop' })) as Checkpoint[];
const p = (id: string, km: number, opts: Partial<LiveParticipant> = {}): LiveParticipant => ({
  session_id: 's', user_id: id, display_name: id, status: 'tracking', sharing: true, distance_m: km * 1000,
  last_at: '2026-12-06T09:59:50Z', last_lat: -13, last_lng: -38.3 - km * KM, ...opts,
});

describe('analyzeCrowd', () => {
  it('maioria por trecho', () => {
    const r = analyzeCrowd([p('a', 2), p('b', 3), p('c', 4), p('d', 12)], cps, now);
    expect(r.segments).toEqual([{ label: 'A → B', count: 3 }, { label: 'B → C', count: 1 }]);
    expect(r.majority).toEqual({ label: 'A → B', share: 0.75 });
  });

  it('atenção: sinal desatualizado, fora do percurso e retardatário', () => {
    const r = analyzeCrowd([
      p('g1', 12), p('g2', 12.5), p('g3', 13), p('g4', 13.5), p('g5', 14),
      p('lento', 3),
      p('perdido', 13, { last_lat: -13.01 }), // ~1,1 km ao sul da rota
      p('mudo', 12, { last_at: '2026-12-06T09:50:00Z' }),
    ], cps, now);
    const by = Object.fromEntries(r.attention.map((a) => [a.user_id, a.reason]));
    expect(by).toEqual({ mudo: 'stale', perdido: 'off_route', lento: 'behind' });
    expect(r.attention.find((a) => a.user_id === 'mudo')?.detail).toBe('10 min sem sinal');
  });

  it('ignora finalizados e quem não compartilha; sem percurso, sem distribuição', () => {
    const r = analyzeCrowd([p('a', 2, { status: 'finished' }), p('b', 2, { last_lat: null, last_lng: null })], cps, now);
    expect(r.positioned).toBe(0);
    expect(r.majority).toBeNull();
    expect(analyzeCrowd([p('a', 2)], [], now).segments).toEqual([]);
  });
});
