import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, fix, pool, signUp } from './helpers';

let ana: string, bia: string, caio: string, estranho: string, admin: string, race: string;
const track = (u: string) => as(u, (q) => q(`update participants set status = 'tracking', sharing = true where session_id = $1 and user_id = $2`, [race, u]));

beforeAll(async () => {
  [ana, bia, caio, estranho] = await Promise.all(['ana', 'bia', 'caio', 'estranho'].map((n) => signUp(n)));
  admin = await signUp('admin', 'admin');
});
afterAll(() => pool.end());

describe('amizades', () => {
  it('envia, aceita e recusa solicitações', async () => {
    await as(ana, (q) => q(`insert into friendships (requester, addressee) values ($1, $2), ($1, $3)`, [ana, bia, caio]));
    await expect(as(ana, (q) => q(`update friendships set status = 'accepted' where addressee = $1 returning 1`, [bia]))).resolves.toHaveLength(0);
    await as(bia, (q) => q(`update friendships set status = 'accepted' where requester = $1 and addressee = $2`, [ana, bia]));
    await as(caio, (q) => q(`update friendships set status = 'accepted' where requester = $1 and addressee = $2`, [ana, caio]));
    expect(await as(estranho, (q) => q(`select * from friendships`))).toHaveLength(0);
  });
  it('não cria solicitação em nome de outro', async () => {
    await expect(as(estranho, (q) => q(`insert into friendships (requester, addressee) values ($1, $2)`, [bia, ana]))).rejects.toThrow();
  });
});

describe('corrida privada', () => {
  it('cria corrida e convida só amigos aceitos', async () => {
    [{ id: race }] = await as(ana, (q) => q(`insert into sessions (kind, name, owner_id) values ('private', 'Treino orla', $1) returning id`, [ana]));
    await as(ana, (q) => q(`insert into participants (session_id, user_id, status) values ($1, $2, 'accepted')`, [race, ana]));
    await as(ana, (q) => q(`insert into participants (session_id, user_id, status) values ($1, $2, 'invited'), ($1, $3, 'invited')`, [race, bia, caio]));
    await expect(as(ana, (q) => q(`insert into participants (session_id, user_id, status) values ($1, $2, 'invited')`, [race, estranho]))).rejects.toThrow();
  });

  it('é privada: estranho e admin não veem', async () => {
    expect(await as(estranho, (q) => q(`select * from sessions where id = $1`, [race]))).toHaveLength(0);
    expect(await as(admin, (q) => q(`select * from live_participants where session_id = $1`, [race]))).toHaveLength(0);
  });

  it('convidado vê o convite e só ele aceita', async () => {
    expect(await as(bia, (q) => q(`select name from sessions where id = $1`, [race]))).toEqual([{ name: 'Treino orla' }]);
    await expect(as(ana, (q) => q(`update participants set status = 'accepted' where session_id = $1 and user_id = $2`, [race, bia]))).rejects.toThrow(/only the participant/);
    await as(bia, (q) => q(`update participants set status = 'accepted' where session_id = $1 and user_id = $2`, [race, bia]));
    await as(caio, (q) => q(`update participants set status = 'declined' where session_id = $1 and user_id = $2`, [race, caio]));
  });

  it('criador inicia; aceitos entram e veem a posição uns dos outros', async () => {
    await expect(track(bia)).rejects.toThrow(/not live/);
    await as(ana, (q) => q(`update sessions set status = 'live' where id = $1`, [race]));
    await track(ana);
    await track(bia);
    await expect(track(caio)).rejects.toThrow(/must accept/); // recusou → fora da corrida
    await as(ana, (q) => q(`select push_positions($1, $2, 250)`, [race, JSON.stringify([fix(0, 20), fix(250)])]));
    const [seen] = await as(bia, (q) => q(`select last_lat, last_lng, distance_m from live_participants where session_id = $1 and user_id = $2`, [race, ana]));
    expect(seen.last_lat).not.toBeNull();
    expect(seen.distance_m).toBe(250);
  });

  it('quem desliga o compartilhamento some do mapa dos amigos', async () => {
    await as(ana, (q) => q(`update participants set sharing = false where session_id = $1 and user_id = $2`, [race, ana]));
    const [seen] = await as(bia, (q) => q(`select last_lat from live_participants where session_id = $1 and user_id = $2`, [race, ana]));
    expect(seen.last_lat).toBeNull();
    const [own] = await as(ana, (q) => q(`select last_lat from live_participants where session_id = $1 and user_id = $2`, [race, ana]));
    expect(own.last_lat).not.toBeNull();
  });

  it('pedido de ajuda sim, emergência não (só evento oficial)', async () => {
    await as(bia, (q) => q(`select raise_alert($1, 'help')`, [race]));
    expect(await as(ana, (q) => q(`select type from alerts where session_id = $1`, [race]))).toEqual([{ type: 'help' }]);
    await expect(as(bia, (q) => q(`select raise_alert($1, 'emergency')`, [race]))).rejects.toThrow(/only in official/);
  });

  it('finalizar a própria participação para o compartilhamento', async () => {
    await as(bia, (q) => q(`update participants set status = 'finished', sharing = true where session_id = $1 and user_id = $2`, [race, bia]));
    const [b] = await as(ana, (q) => q(`select status, sharing, last_lat from live_participants where session_id = $1 and user_id = $2`, [race, bia]));
    expect(b).toEqual({ status: 'finished', sharing: false, last_lat: null });
  });

  it('criador encerra para todos', async () => {
    await as(ana, (q) => q(`update participants set sharing = true where session_id = $1 and user_id = $2`, [race, ana]));
    await as(ana, (q) => q(`update sessions set status = 'ended' where id = $1`, [race]));
    const rows = await as(ana, (q) => q(`select status from live_participants where session_id = $1 and status = 'tracking'`, [race]));
    expect(rows).toHaveLength(0);
  });
});
