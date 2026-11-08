import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, pool, signUp, sys } from './helpers';

let admin: string, ana: string, bia: string, ev: string, race: string;
beforeAll(async () => {
  admin = await signUp('admin-dir', 'admin');
  ana = await signUp('ana-dir');
  bia = await signUp('bia-dir', 'user', false);
  // Evento real (não teste) para contar no diretório.
  [{ id: ev }] = await as(admin, (q) => q(`insert into sessions (kind, name, owner_id, status) values ('official', 'Diretório', $1, 'live') returning id`, [admin]));
  await as(ana, (q) => q(`insert into participants (session_id, user_id) values ($1, $2)`, [ev, ana]));
  await as(ana, (q) => q(`update participants set status = 'tracking', sharing = true where session_id = $1 and user_id = $2`, [ev, ana]));
  await sys(`update participants set distance_m = 12345 where session_id = $1 and user_id = $2`, [ev, ana]);
  [{ id: race }] = await as(ana, (q) => q(`insert into sessions (kind, name, owner_id, status) values ('private', 'Treino secreto', $1, 'live') returning id`, [ana]));
  await as(ana, (q) => q(`insert into participants (session_id, user_id, status) values ($1, $2, 'accepted')`, [race, ana]));
  await as(ana, (q) => q(`update participants set status = 'tracking' where session_id = $1 and user_id = $2`, [race, ana]));
});
afterAll(async () => {
  await sys(`delete from sessions where id = any($1)`, [[ev, race]]);
  await pool.end();
});

describe('eventos só por admin', () => {
  it('participante não cria evento oficial', async () => {
    await expect(as(ana, (q) => q(`insert into sessions (kind, name, owner_id) values ('official', 'x', $1)`, [ana]))).rejects.toThrow(/row-level security/);
  });
  it('dono de corrida privada não a transforma em evento oficial nem troca o dono', async () => {
    await expect(as(ana, (q) => q(`update sessions set kind = 'official' where id = $1`, [race]))).rejects.toThrow(/cannot change/);
    await expect(as(ana, (q) => q(`update sessions set owner_id = $2 where id = $1`, [race, bia]))).rejects.toThrow(/cannot change/);
  });
  it('participante não altera evento oficial', async () => {
    expect(await as(ana, (q) => q(`update sessions set name = 'hack' where id = $1 returning id`, [ev]))).toHaveLength(0);
  });
});

describe('permissão de organizador', () => {
  it('ninguém vira admin editando o próprio perfil', async () => {
    await expect(as(ana, (q) => q(`update profiles set role = 'admin' where id = $1`, [ana]))).rejects.toThrow();
    const [p] = await sys(`select role from profiles where id = $1`, [ana]);
    expect(p.role).toBe('user');
  });
  it('participante não concede admin', async () => {
    await expect(as(ana, (q) => q(`select set_admin($1, true)`, [ana]))).rejects.toThrow(/not allowed/);
  });
  it('admin concede e retira, com registro de quem fez', async () => {
    await as(admin, (q) => q(`select set_admin($1, true)`, [bia]));
    expect((await sys(`select role from profiles where id = $1`, [bia]))[0].role).toBe('admin');
    await as(admin, (q) => q(`select set_admin($1, false)`, [bia]));
    const log = await sys(`select actor, role from role_changes where user_id = $1 order by id`, [bia]);
    expect(log).toEqual([{ actor: admin, role: 'admin' }, { actor: admin, role: 'user' }]);
    const shown = await as(admin, (q) => q(`select user_name, actor_name, role from list_role_changes() where user_name = 'bia-dir'`));
    expect(shown[0]).toMatchObject({ actor_name: 'admin-dir', role: 'user' });
    expect(await as(ana, (q) => q(`select * from list_role_changes()`))).toHaveLength(0);
  });
  it('admin não retira o próprio acesso', async () => {
    await expect(as(admin, (q) => q(`select set_admin($1, false)`, [admin]))).rejects.toThrow(/yourself/);
  });
});

describe('diretório de pessoas', () => {
  it('admin vê todos com contadores; participante não vê nada', async () => {
    const rows = await as(admin, (q) => q(`select * from admin_people() where id = any($1)`, [[ana, bia]]));
    const a = rows.find((r) => r.id === ana);
    expect(a).toMatchObject({ events_joined: 1, events_started: 1, races_started: 1, has_photo: true });
    expect(Number(a.total_km)).toBeCloseTo(12.3, 1);
    expect(a.email).toMatch(/@teste\.dev$/);
    expect(rows.find((r) => r.id === bia)).toMatchObject({ events_joined: 0, races_started: 0, has_photo: false, phone: null });
    expect(await as(ana, (q) => q(`select * from admin_people()`))).toHaveLength(0);
  });
  it('histórico esconde o nome de corridas privadas', async () => {
    const h = await as(admin, (q) => q(`select kind, name from admin_person_history($1)`, [ana]));
    expect(h.map((r) => r.name).sort()).toEqual(['Corrida privada', 'Diretório']);
    expect(await as(bia, (q) => q(`select * from admin_person_history($1)`, [ana]))).toHaveLength(0);
  });
});
