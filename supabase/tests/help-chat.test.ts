import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, pool, signUp, sys } from './helpers';

let admin: string, ana: string, bia: string, fora: string, ev: string, race: string;
const send = (who: string, user: string, body: string, session = ev) => as(who, (q) => q(`select send_help_message($1, $2, $3) id`, [session, user, body]));
const thread = (who: string, user: string) => as(who, (q) => q(`select sender_id, body from help_messages where session_id = $1 and user_id = $2 order by id`, [ev, user]));

beforeAll(async () => {
  admin = await signUp('admin-chat', 'admin');
  ana = await signUp('ana-chat');
  bia = await signUp('bia-chat');
  fora = await signUp('fora-chat');
  [{ id: ev }] = await as(admin, (q) => q(`insert into sessions (kind, name, owner_id, status, is_test) values ('official', 'Chat', $1, 'live', true) returning id`, [admin]));
  for (const u of [ana, bia]) await as(u, (q) => q(`insert into participants (session_id, user_id) values ($1, $2)`, [ev, u]));
  await sys(`update participants set last_lat = -12.96, last_lng = -38.4 where session_id = $1 and user_id = $2`, [ev, ana]);
  [{ id: race }] = await as(ana, (q) => q(`insert into sessions (kind, name, owner_id, status) values ('private', 'Treino', $1, 'live') returning id`, [ana]));
  await as(ana, (q) => q(`insert into participants (session_id, user_id, status) values ($1, $2, 'accepted')`, [race, ana]));
});
afterAll(async () => {
  await sys(`delete from sessions where id = any($1)`, [[ev, race]]);
  await pool.end();
});

describe('ajuda por conversa', () => {
  it('1ª mensagem abre pedido de ajuda com a posição; as seguintes não duplicam', async () => {
    await send(ana, ana, 'Câimbra na perna');
    await send(ana, ana, 'Estou perto do posto');
    const al = await sys(`select type, lat, resolved_at from alerts where session_id = $1 and user_id = $2`, [ev, ana]);
    expect(al).toEqual([{ type: 'help', lat: -12.96, resolved_at: null }]);
  });
  it('organização lê e responde; participante vê a resposta', async () => {
    expect((await thread(admin, ana)).map((m) => m.body)).toEqual(['Câimbra na perna', 'Estou perto do posto']);
    await send(admin, ana, 'Equipe a caminho, fique onde está');
    const t = await thread(ana, ana);
    expect(t.at(-1)).toEqual({ sender_id: admin, body: 'Equipe a caminho, fique onde está' });
  });
  it('outros participantes não leem nem escrevem na conversa alheia', async () => {
    expect(await thread(bia, ana)).toHaveLength(0);
    await expect(send(bia, ana, 'oi')).rejects.toThrow(/not allowed/);
    await expect(send(fora, fora, 'oi')).rejects.toThrow(/not a participant/);
    await expect(as(ana, (q) => q(`insert into help_messages (session_id, user_id, sender_id, body) values ($1, $2, $2, 'x')`, [ev, ana]))).rejects.toThrow(/permission denied/);
  });
  it('depois de resolvido, nova mensagem abre novo pedido; mensagem vazia ou corrida privada são recusadas', async () => {
    await sys(`update alerts set resolved_at = now() where session_id = $1 and user_id = $2`, [ev, ana]);
    await send(ana, ana, 'Voltou a doer');
    expect(await sys(`select count(*)::int n from alerts where session_id = $1 and user_id = $2 and resolved_at is null`, [ev, ana])).toEqual([{ n: 1 }]);
    await expect(send(ana, ana, '   ')).rejects.toThrow(/check/);
    await expect(send(ana, ana, 'oi', race)).rejects.toThrow(/only in official/);
  });
});

describe('encerrar atendimento', () => {
  const open = (u: string) => sys(`select count(*)::int n from alerts where session_id = $1 and user_id = $2 and type in ('help','emergency') and resolved_at is null`, [ev, u]);
  it('participante encerra o próprio (ajuda e emergência), com registro na conversa', async () => {
    await as(bia, (q) => q(`select raise_alert($1, 'emergency')`, [ev]));
    await send(bia, bia, 'Caí');
    expect(await open(bia)).toEqual([{ n: 1 }]);
    expect((await as(bia, (q) => q(`select close_help($1, $2) n`, [ev, bia])))[0].n).toBe(1);
    expect(await open(bia)).toEqual([{ n: 0 }]);
    const [r] = await sys(`select resolved_by from alerts where session_id = $1 and user_id = $2 and type = 'emergency'`, [ev, bia]);
    expect(r.resolved_by).toBe(bia);
    expect((await thread(admin, bia)).at(-1)!.body).toBe('Atendimento encerrado pelo participante.');
  });
  it('organização encerra o de qualquer um; outro participante não', async () => {
    await send(ana, ana, 'De novo');
    await expect(as(bia, (q) => q(`select close_help($1, $2)`, [ev, ana]))).rejects.toThrow(/not allowed/);
    expect((await as(admin, (q) => q(`select close_help($1, $2) n`, [ev, ana])))[0].n).toBe(1);
    expect((await thread(ana, ana)).at(-1)).toEqual({ sender_id: admin, body: 'Atendimento encerrado pela organização.' });
    expect((await as(admin, (q) => q(`select close_help($1, $2) n`, [ev, ana])))[0].n).toBe(0); // nada aberto: sem mensagem repetida
  });
});
