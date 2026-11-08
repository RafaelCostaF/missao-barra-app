import { describe, expect, it } from 'vitest';
import {
  averagePaceS, createRunStats, currentKm, etaTo, fmtClock, fmtPace, nearbyRunners, racePosition, routeEtas, routeProgress,
  type Checkpoint, type Fix, type LiveParticipant,
} from '../src';

const T0 = Date.parse('2026-11-08T05:00:00Z');
const LAT = -12.957, LNG = -38.3537;
const west = (m: number) => LNG - m / 108_500; // ~metros para oeste na latitude de Salvador
/** Corrida reta para oeste: `paceS` s/km, um fix a cada `every` s. */
function run(paceS: number, seconds: number, every = 20, startS = 0): Fix[] {
  const out: Fix[] = [];
  for (let s = startS; s <= startS + seconds; s += every)
    out.push({ lat: LAT, lng: west((s / paceS) * 1000), accuracy: 6, recordedAt: new Date(T0 + s * 1000).toISOString() });
  return out;
}
const cps: Checkpoint[] = [0, 10, 20].map((km, i) => ({ id: String(i), session_id: 's', name: ['Farol', 'Jardim de Alah', 'Barra'][i], km, lat: LAT, lng: west(km * 1000), kind: i ? (i === 2 ? 'finish' : 'stop') : 'start' }));

describe('métricas do corredor', () => {
  it('pace atual, médio em movimento, velocidade e parciais por km', () => {
    const st = createRunStats();
    st.add(run(360, 1500)); // 6:00/km por 25 min ≈ 4,17 km
    const s = st.snapshot(T0 + 1500 * 1000);
    expect(s.distanceM).toBeGreaterThan(4100);
    expect(s.distanceM).toBeLessThan(4250);
    expect(fmtPace(s.currentPaceS)).toMatch(/^(5:5\d|6:0\d)$/);
    expect(Math.round(s.speedKmh!)).toBe(10);
    expect(s.splits).toHaveLength(4);
    s.splits.forEach((x) => expect(Math.abs(x - 360)).toBeLessThan(15));
  });
  it('parado ou sem sinal: sem pace atual; parada não conta como tempo em movimento', () => {
    const st = createRunStats();
    st.add(run(360, 600));
    const stopped = Array.from({ length: 10 }, (_, i) => ({ ...run(360, 0, 20, 600)[0], recordedAt: new Date(T0 + (620 + i * 20) * 1000).toISOString() }));
    st.add(stopped);
    const s = st.snapshot(T0 + 800 * 1000);
    expect(s.currentPaceS).toBeNull();
    expect(Math.abs(s.movingS - 600)).toBeLessThan(25);
    expect(st.snapshot(T0 + 3600 * 1000).currentPaceS).toBeNull(); // sinal antigo
  });
  it('ignora fixes imprecisos', () => {
    const st = createRunStats();
    st.add(run(360, 300).map((f, i) => (i % 2 ? { ...f, lng: f.lng + 0.01, accuracy: 80 } : f)));
    expect(st.snapshot(T0 + 300_000).distanceM).toBeLessThan(900);
    expect(st.snapshot(T0 + 300_000).lastAccuracyM).toBe(80); // qualidade do GPS agora (última leitura)
  });
  it('formatos', () => {
    expect(fmtPace(342)).toBe('5:42');
    expect(fmtPace(null)).toBe('—');
    expect(fmtClock(3909)).toBe('1:05:09');
    expect(fmtClock(2530)).toBe('42:10');
    expect(fmtPace(averagePaceS(new Date(T0).toISOString(), 5000, T0 + 30 * 60_000))).toBe('6:00');
  });
});

describe('percurso e estimativas', () => {
  it('converte a posição no km oficial e estima chegada no pace atual', () => {
    const p = routeProgress({ lat: LAT + 0.0005, lng: west(4200) }, cps)!;
    expect(p.km).toBeCloseTo(4.2, 1);
    expect(p.offRouteM).toBeLessThan(80);
    expect(currentKm({ lat: LAT, lng: west(4200) }, 9999, cps)).toBeCloseTo(4.2, 1);
    expect(currentKm({ lat: LAT + 0.05, lng: west(4200) }, 3900, cps)).toBe(3.9); // longe do percurso: usa o GPS
    const { next, finish } = routeEtas(cps, 4.2, 360, T0);
    expect(next).toMatchObject({ name: 'Jardim de Alah', remainingM: 5800 });
    expect(Math.round(next!.etaS!)).toBe(2088); // 5,8 km × 6:00
    expect(finish!.remainingM).toBe(15800);
    expect(new Date(finish!.at!).getTime()).toBe(T0 + 15.8 * 360 * 1000);
    expect(routeEtas(cps, 20, 360).finish).toBeNull();
    expect(etaTo(cps[1], 4.2, null).etaS).toBeNull();
  });
});

describe('quem está perto', () => {
  const now = T0;
  const p = (id: string, m: number, extra: Partial<LiveParticipant> = {}): LiveParticipant => ({
    session_id: 's', user_id: id, display_name: id, status: 'tracking', sharing: true, distance_m: m,
    last_at: new Date(now - 30_000).toISOString(), last_lat: LAT, last_lng: west(m), ...extra,
  });
  it('lista os próximos com à frente/atrás pelo percurso, ignorando sem sinal e longe', () => {
    const others = [p('bia', 4500), p('caio', 3950), p('duda', 9000), p('edu', 4300, { last_at: new Date(now - 10 * 60_000).toISOString() })];
    const near = nearbyRunners({ lat: LAT, lng: west(4200) }, 4.2, others, cps, 2000, now);
    expect(near.map((n) => n.name)).toEqual(['caio', 'bia']);
    expect(near[0].aheadM).toBeCloseTo(-250, -1);
    expect(near[1].aheadM).toBeCloseTo(300, -1);
  });
  it('posição na prova e distância para quem está à frente', () => {
    const field = [p('eu', 4200), p('bia', 4500), p('caio', 3900), p('zé', 100, { status: 'accepted' })];
    expect(racePosition('eu', field)).toEqual({ position: 2, total: 3, ahead: { name: 'bia', gapM: 300 } });
    expect(racePosition('bia', field)!.ahead).toBeNull();
  });
});
