import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, completeProfile, pool, signUp, sys } from './helpers';

let admin: string, ana: string, novo: string, ev: string;
beforeAll(async () => {
  admin = await signUp('admin-sec', 'admin');
  ana = await signUp('ana-sec');
  novo = await signUp('novo-sec', 'user', false); // sem foto e sem celular verificado
  [{ id: ev }] = await as(admin, (q) => q(`insert into sessions (kind, name, owner_id, status, is_test) values ('official', 'Seg', $1, 'live', true) returning id`, [admin]));
  for (const u of [ana, novo]) await as(u, (q) => q(`insert into participants (session_id, user_id) values ($1, $2)`, [ev, u]));
});
afterAll(() => pool.end());

const track = (u: string) => as(u, (q) => q(`update participants set status = 'tracking', sharing = true where session_id = $1 and user_id = $2`, [ev, u]));

describe('cadastro completo e bateria', () => {
  it('sem foto e celular verificado não inicia evento oficial', async () => {
    await expect(track(novo)).rejects.toThrow(/profile incomplete/);
    await completeProfile(novo);
    await track(novo);
  });
  it('bateria chega com as posições e não pode ser forjada', async () => {
    await track(ana);
    await as(ana, (q) => q(`select push_positions($1, $2, 0, 17::smallint)`, [ev, JSON.stringify([{ lat: -12.96, lng: -38.37, accuracy: 5, recordedAt: new Date().toISOString() }])]));
    const [p] = await as(admin, (q) => q(`select battery from live_participants where session_id = $1 and user_id = $2`, [ev, ana]));
    expect(p.battery).toBe(17);
    await expect(as(ana, (q) => q(`update participants set battery = 100 where session_id = $1 and user_id = $2`, [ev, ana]))).rejects.toThrow(/server-managed/);
  });
  it('organização finaliza a participação de alguém (desistência)', async () => {
    await as(admin, (q) => q(`update participants set status = 'finished' where session_id = $1 and user_id = $2`, [ev, ana]));
    const [e] = await as(admin, (q) => q(`select actor from participant_events where session_id = $1 and user_id = $2 and event = 'finished'`, [ev, ana]));
    expect(e.actor).toBe(admin);
  });
});

describe('equipe', () => {
  it('admin promove e remove organizador pelo e-mail; não remove a si mesmo', async () => {
    const [{ email }] = await sys(`select email from auth.users where id = $1`, [ana]);
    await as(admin, (q) => q(`select set_staff($1, true)`, [email.toUpperCase()]));
    expect((await as(admin, (q) => q(`select id from list_staff()`))).map((r) => r.id)).toContain(ana);
    await as(admin, (q) => q(`select set_staff($1, false)`, [email]));
    const [{ email: me }] = await sys(`select email from auth.users where id = $1`, [admin]);
    await expect(as(admin, (q) => q(`select set_staff($1, false)`, [me]))).rejects.toThrow(/yourself/);
  });
  it('participante não promove ninguém nem vê a equipe', async () => {
    const [{ email }] = await sys(`select email from auth.users where id = $1`, [novo]);
    await expect(as(novo, (q) => q(`select set_staff($1, true)`, [email]))).rejects.toThrow(/not allowed/);
    expect(await as(novo, (q) => q(`select * from list_staff()`))).toHaveLength(0);
  });
});
