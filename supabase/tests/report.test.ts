import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, pool, signUp, sys } from './helpers';

let admin: string, ana: string, bia: string, ev: string;
const T0 = Date.now() - 6 * 3600_000; // percurso nas últimas 6 h
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const CP = [
  { name: 'Itapuã', km: 0, lat: -12.9570655, lng: -38.3536886 },
  { name: 'Corsário', km: 6, lat: -12.9681066, lng: -38.4057227 },
  { name: 'Barra', km: 20, lat: -13.0101987, lng: -38.5329168 },
];
const push = (u: string, fixes: { lat: number; lng: number; min: number }[], d: number) =>
  as(u, (q) => q(`select push_positions($1, $2, $3)`, [ev, JSON.stringify(fixes.map((f) => ({ lat: f.lat, lng: f.lng, accuracy: 5, recordedAt: at(f.min) }))), d]));

beforeAll(async () => {
  admin = await signUp('admin-rel', 'admin');
  ana = await signUp('ana-rel');
  bia = await signUp('bia-rel');
  [{ id: ev }] = await as(admin, (q) => q(`insert into sessions (kind, name, owner_id, status, is_test) values ('official', 'Relatório', $1, 'live', true) returning id`, [admin]));
  for (const c of CP) await as(admin, (q) => q(`insert into checkpoints (session_id, name, km, lat, lng) values ($1,$2,$3,$4,$5)`, [ev, c.name, c.km, c.lat, c.lng]));
  for (const u of [ana, bia]) await as(u, async (q) => {
    await q(`insert into participants (session_id, user_id) values ($1, $2)`, [ev, u]);
    await q(`update participants set status = 'tracking', sharing = true where session_id = $1 and user_id = $2`, [ev, u]);
  });
  // Ana: passa Itapuã (0 min), Corsário (75 min), fica 40 min sem sinal, chega na Barra (300 min) e finaliza.
  await push(ana, [{ ...CP[0], min: 0 }, { lat: -12.962, lng: -38.38, min: 35 }, { ...CP[1], min: 75 }], 6000);
  await push(ana, [{ lat: -12.99, lng: -38.45, min: 115 }, { ...CP[2], min: 300 }], 14000);
  await as(ana, (q) => q(`select raise_alert($1, 'help')`, [ev]));
  await as(ana, (q) => q(`select raise_alert($1, 'help')`, [ev]));
  await as(ana, (q) => q(`select raise_alert($1, 'emergency')`, [ev]));
  await as(ana, (q) => q(`update participants set status = 'finished' where session_id = $1 and user_id = $2`, [ev, ana]));
  // Bia: só até Itapuã e segue rastreando (será finalizada pelo encerramento).
  await push(bia, [{ ...CP[0], min: 5 }, { lat: -12.958, lng: -38.36, min: 20 }], 800);
});
afterAll(() => pool.end());

describe('relatório por participante', () => {
  it('calcula passagens pelos pontos, duração, maior tempo sem sinal e chamados', async () => {
    const rows = await as(admin, (q) => q(`select * from session_report($1)`, [ev]));
    const a = rows.find((r) => r.user_id === ana)!;
    expect(a.passages.map((p: any) => [p.name, p.elapsed_s / 60])).toEqual([['Itapuã', 0], ['Corsário', 75], ['Barra', 300]]);
    expect(a).toMatchObject({ distance_m: 20000, positions: 5, max_gap_s: 185 * 60, alerts_help: 2, alerts_emergency: 1, status: 'finished' });
    expect(a.duration_s).toBeGreaterThan(0);
    const b = rows.find((r) => r.user_id === bia)!;
    expect(b.passages.map((p: any) => p.name)).toEqual(['Itapuã']);
  });

  it('só quem gerencia vê o relatório; participante vê apenas o próprio resumo', async () => {
    await expect(as(ana, (q) => q(`select * from session_report($1)`, [ev]))).rejects.toThrow(/not allowed/);
    await expect(as(ana, (q) => q(`select * from _session_report($1)`, [ev]))).rejects.toThrow(/permission denied/);
  });

  it('encerrar grava o resumo durável, que sobrevive à limpeza da trilha', async () => {
    await as(admin, (q) => q(`update sessions set status = 'ended' where id = $1`, [ev]));
    const [{ n }] = await sys(`select count(*)::int n from participant_summaries where session_id = $1`, [ev]);
    expect(n).toBe(2);
    await sys(`delete from positions where session_id = $1`, [ev]); // simula a retenção de 30 dias
    const rows = await as(admin, (q) => q(`select user_id, status, positions, passages from session_report($1)`, [ev]));
    expect(rows.find((r) => r.user_id === ana)!.passages).toHaveLength(3);
    expect(rows.find((r) => r.user_id === bia)!.status).toBe('finished');
    expect(await as(bia, (q) => q(`select user_id from participant_summaries where session_id = $1`, [ev]))).toEqual([{ user_id: bia }]);
  });

  it('auditoria: linha do tempo de status e quem resolveu cada alerta', async () => {
    const events = await as(admin, (q) => q(`select event, actor from participant_events where session_id = $1 and user_id = $2 order by id`, [ev, ana]));
    expect(events.map((e) => e.event)).toEqual(['accepted', 'tracking', 'sharing_on', 'finished', 'sharing_off']);
    expect(events.every((e) => e.actor === ana)).toBe(true);
    const ended = await as(admin, (q) => q(`select event, actor from participant_events where session_id = $1 and user_id = $2 and event = 'finished'`, [ev, bia]));
    expect(ended[0].actor).toBe(admin); // encerrado pelo admin
    const [al] = await as(admin, (q) => q(`update alerts set resolved_at = now() where session_id = $1 and type = 'emergency' returning resolved_by`, [ev]));
    expect(al.resolved_by).toBe(admin);
    await expect(as(ana, (q) => q(`insert into participant_events (session_id, user_id, event) values ($1, $2, 'fake')`, [ev, ana]))).rejects.toThrow();
  });
});
