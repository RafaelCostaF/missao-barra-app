import { afterAll, describe, expect, it } from 'vitest';
import { as, fix, pool, signUp, sys } from './helpers';

afterAll(() => pool.end());

// Simula N participantes sem contas reais enviando posições, como faria simulate-positions.
describe('carga', () => {
  it('200 participantes × 5 lotes de posições', async () => {
    const admin = await signUp('admin-carga', 'admin');
    const [{ id }] = await as(admin, (q) => q(`insert into sessions (kind, name, owner_id, status, is_test) values ('official', 'Carga', $1, 'live', true) returning id`, [admin]));
    const users = await Promise.all(Array.from({ length: 200 }, (_, i) => signUp(`sim${i}`)));
    await Promise.all(users.map((u) => as(u, async (q) => {
      await q(`insert into participants (session_id, user_id) values ($1, $2)`, [id, u]);
      await q(`update participants set status = 'tracking', sharing = true where session_id = $1 and user_id = $2`, [id, u]);
    })));

    const t0 = Date.now();
    for (let round = 0; round < 5; round++) {
      await Promise.all(users.map((u, i) => as(u, (q) => q(`select push_positions($1, $2, 100)`, [id, JSON.stringify([fix(round * 100 + i)])]))));
    }
    const ms = Date.now() - t0;

    const [{ n }] = await sys(`select count(*)::int n from positions where session_id = $1`, [id]);
    expect(n).toBe(1000);
    const live = await as(admin, (q) => q(`select * from live_participants where session_id = $1`, [id]));
    expect(live).toHaveLength(200);
    expect(ms / 1000).toBeLessThan(30); // ~1000 envios; referência para regressões
    console.log(`1000 push_positions em ${ms} ms`);
  }, 60_000);
});
