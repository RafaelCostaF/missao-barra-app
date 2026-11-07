import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, fix, pool, signUp, sys } from './helpers';

let admin: string, ana: string, bia: string, intruso: string, ev: string;

beforeAll(async () => {
  admin = await signUp('admin', 'admin');
  ana = await signUp('ana');
  bia = await signUp('bia');
  intruso = await signUp('intruso');
});
afterAll(() => pool.end());

describe('cadastro', () => {
  it('cria perfil com pseudo_id e papel user', async () => {
    const [p] = await as(ana, (q) => q('select display_name, role, pseudo_id from profiles where id = $1', [ana]));
    expect(p).toMatchObject({ display_name: 'ana', role: 'user' });
    expect(p.pseudo_id).toBeTruthy();
  });
  it('usuário não se promove a admin', async () => {
    await expect(as(ana, (q) => q(`update profiles set role = 'admin' where id = $1`, [ana]))).rejects.toThrow();
  });
});

describe('evento oficial', () => {
  it('só admin cria evento oficial', async () => {
    await expect(as(ana, (q) => q(`insert into sessions (kind, name, owner_id) values ('official', 'x', $1)`, [ana]))).rejects.toThrow();
    [{ id: ev }] = await as(admin, (q) => q(`insert into sessions (kind, name, owner_id, is_test) values ('official', 'Ensaio', $1, true) returning id`, [admin]));
    await as(admin, (q) => q(`insert into checkpoints (session_id, name, km, lat, lng, kind) values ($1, 'Itapuã', 10, -12.957, -38.353, 'stop')`, [ev]));
  });

  it('rascunho fica invisível; publicado aparece na lista', async () => {
    const list = async () => (await as(ana, (q) => q(`select id from sessions where kind = 'official' and status in ('published','live')`))).map((s) => s.id);
    expect(await list()).not.toContain(ev);
    await as(admin, (q) => q(`update sessions set status = 'published' where id = $1`, [ev]));
    expect(await list()).toContain(ev);
  });

  it('usuário comum não edita evento', async () => {
    const rows = await as(ana, (q) => q(`update sessions set name = 'hack' where id = $1 returning id`, [ev]));
    expect(rows).toHaveLength(0);
  });

  it('entra no evento, mas só rastreia quando estiver ao vivo', async () => {
    await as(ana, (q) => q(`insert into participants (session_id, user_id) values ($1, $2)`, [ev, ana]));
    await as(bia, (q) => q(`insert into participants (session_id, user_id) values ($1, $2)`, [ev, bia]));
    await expect(as(ana, (q) => q(`update participants set status = 'tracking', sharing = true where session_id = $1 and user_id = $2`, [ev, ana]))).rejects.toThrow(/not live/);
    await as(admin, (q) => q(`update sessions set status = 'live' where id = $1`, [ev]));
    for (const u of [ana, bia])
      await as(u, (q) => q(`update participants set status = 'tracking', sharing = true where session_id = $1 and user_id = $2`, [ev, u]));
  });

  it('admin não inicia rastreamento por outra pessoa', async () => {
    await expect(as(admin, (q) => q(`insert into participants (session_id, user_id, status) values ($1, $2, 'tracking')`, [ev, intruso]))).rejects.toThrow();
  });

  it('envia posições do GPS em lote e o admin vê no mapa', async () => {
    const fixes = [fix(0, 60), fix(500, 30), fix(1000, 0)];
    await as(ana, (q) => q(`select push_positions($1, $2, $3)`, [ev, JSON.stringify(fixes), 1000]));
    const [p] = await as(admin, (q) => q(`select last_lat, last_lng, distance_m, last_at from live_participants where session_id = $1 and user_id = $2`, [ev, ana]));
    expect(p.last_lng).toBeCloseTo(fixes[2].lng, 6);
    expect(p.distance_m).toBe(1000);
    const trail = await as(admin, (q) => q(`select count(*)::int n from positions where session_id = $1 and user_id = $2`, [ev, ana]));
    expect(trail[0].n).toBe(3);
  });

  it('posição não pode ser forjada por update direto', async () => {
    await expect(as(ana, (q) => q(`update participants set distance_m = 99999 where session_id = $1 and user_id = $2`, [ev, ana]))).rejects.toThrow(/server-managed/);
    await expect(as(ana, (q) => q(`select last_lat from participants where session_id = $1`, [ev]))).rejects.toThrow(/permission denied/);
  });

  it('quem não participa não vê nada; participante não lê a trilha completa', async () => {
    expect(await as(intruso, (q) => q(`select * from live_participants where session_id = $1`, [ev]))).toHaveLength(0);
    expect(await as(bia, (q) => q(`select * from positions where session_id = $1`, [ev]))).toHaveLength(0);
    await expect(as(intruso, (q) => q(`select push_positions($1, $2, 0)`, [ev, JSON.stringify([fix(0)])]))).rejects.toThrow(/not tracking/);
  });

  it('emergência chega ao painel com a última posição', async () => {
    await as(ana, (q) => q(`select raise_alert($1, 'emergency')`, [ev]));
    const [a] = await as(admin, (q) => q(`select type, lat, lng, user_id from alerts where session_id = $1 and resolved_at is null`, [ev]));
    expect(a).toMatchObject({ type: 'emergency', user_id: ana });
    expect(a.lat).not.toBeNull();
    await expect(as(intruso, (q) => q(`select raise_alert($1, 'help')`, [ev]))).rejects.toThrow(/not a participant/);
    await expect(as(ana, (q) => q(`insert into alerts (session_id, user_id, type) values ($1, $2, 'help')`, [ev, ana]))).rejects.toThrow();
  });

  it('perda prolongada de sinal gera um único alerta', async () => {
    await as(bia, (q) => q(`select push_positions($1, $2, 0)`, [ev, JSON.stringify([fix(0, 15 * 60)])]));
    expect((await sys(`select flag_lost_signals() n`))[0].n).toBe(1);
    expect((await sys(`select flag_lost_signals() n`))[0].n).toBe(0);
    await expect(as(ana, (q) => q(`select flag_lost_signals()`))).rejects.toThrow(/permission denied/);
  });

  it('encerrar o evento finaliza todos e para o compartilhamento', async () => {
    await as(admin, (q) => q(`update sessions set status = 'ended' where id = $1`, [ev]));
    const rows = await as(admin, (q) => q(`select status, sharing from live_participants where session_id = $1`, [ev]));
    expect(rows.every((r) => r.status === 'finished' && !r.sharing)).toBe(true);
    await expect(as(ana, (q) => q(`select push_positions($1, $2, 0)`, [ev, JSON.stringify([fix(0)])]))).rejects.toThrow(/not tracking/);
  });

  it('logs técnicos: usuário não lê nem grava; admin lê', async () => {
    await sys(`insert into app_logs (ts, level, event) values (now(), 'error', 'gps.error')`);
    await expect(as(ana, (q) => q(`insert into app_logs (ts, level, event) values (now(), 'info', 'x')`))).rejects.toThrow();
    expect(await as(ana, (q) => q(`select * from app_logs`))).toHaveLength(0);
    expect((await as(admin, (q) => q(`select * from app_logs`))).length).toBeGreaterThan(0);
  });
});
