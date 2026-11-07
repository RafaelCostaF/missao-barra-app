// Contra o Supabase local completo (`npx supabase start`): Realtime + Edge Function log-ingest de verdade.
// Rodar: npm run test:realtime
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import { createApi, createLogger, memoryStore, toNotice, type Api, type Change } from '@mb/core';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
const ANON = process.env.SUPABASE_ANON_KEY!;
const db = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres' });
const run = Date.now().toString(36);
const clients: SupabaseClient[] = [];

async function user(name: string) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(c);
  const api = createApi(c);
  await api.signUp(`${name}-${run}@teste.dev`, 'senha-forte-123', name);
  return { c, api, id: await api.me() };
}

/** Assina como o app faz e devolve uma função que espera o próximo aviso. */
function listen(api: Api, name: string, tables: Change['table'][], me: string) {
  const got: Change[] = [];
  return new Promise<{ next: (pred: (c: Change) => boolean, ms?: number) => Promise<Change> }>((ready) => {
    const ch = api.subscribe(name, tables, (c) => got.push(c));
    // "joined" chega antes do Postgres começar a enviar; esperar a confirmação do postgres_changes.
    ch.on('system' as never, {}, (m: any) => {
      if (m?.extension === 'postgres_changes' && m?.status === 'ok')
        ready({
          next: (pred, ms = 8000) => new Promise((ok, fail) => {
            const end = Date.now() + ms;
            const poll = setInterval(() => {
              const hit = got.find(pred);
              if (hit) { clearInterval(poll); ok(hit); }
              else if (Date.now() > end) { clearInterval(poll); fail(new Error(`sem evento em ${name}: recebidos ${JSON.stringify(got.map((g) => g.table + ':' + g.eventType))}`)); }
            }, 100);
          }),
        });
    });
  });
}

let admin: Awaited<ReturnType<typeof user>>, ana: Awaited<ReturnType<typeof user>>, bia: Awaited<ReturnType<typeof user>>;

beforeAll(async () => {
  [admin, ana, bia] = await Promise.all([user('admin'), user('ana'), user('bia')]);
  await db.query(`update profiles set role = 'admin' where id = $1`, [admin.id]);
});
afterAll(async () => {
  for (const c of clients) await c.removeAllChannels();
  await db.end();
});

describe('notificações em tempo real', () => {
  it('bia recebe a solicitação de amizade; ana recebe o aceite', async () => {
    const biaL = await listen(bia.api, `n-bia-${run}`, ['friendships'], bia.id);
    const anaL = await listen(ana.api, `n-ana-${run}`, ['friendships'], ana.id);
    await ana.api.requestFriend(bia.id);
    const req = await biaL.next((c) => c.eventType === 'INSERT');
    expect(toNotice(req, bia.id, () => 'ana')?.kind).toBe('friend_request');
    await bia.api.respondFriend(ana.id, true);
    const acc = await anaL.next((c) => c.eventType === 'UPDATE');
    expect(toNotice(acc, ana.id, () => 'bia')?.kind).toBe('friend_accepted');
  });

  it('bia recebe o convite para a corrida', async () => {
    const biaL = await listen(bia.api, `n2-bia-${run}`, ['participants'], bia.id);
    await ana.api.createRace(`Treino ${run}`, [bia.id]);
    const inv = await biaL.next((c) => c.table === 'participants' && c.new.user_id === bia.id);
    expect(toNotice(inv, bia.id, () => 'ana')?.kind).toBe('invite');
  });

  it('painel recebe emergência ao vivo; estranho não recebe nada', async () => {
    const ev = (await admin.api.saveEvent({ name: `RT ${run}`, is_test: true, status: 'live' })).id;
    const adminL = await listen(admin.api, `a-${run}`, ['alerts', 'participants'], admin.id);
    const intruso = await user('intruso');
    const intrusoL = await listen(intruso.api, `i-${run}`, ['alerts'], intruso.id);
    await ana.api.joinEvent(ev);
    await ana.api.startTracking(ev);
    await adminL.next((c) => c.table === 'participants' && c.new.status === 'tracking');
    await ana.api.raiseAlert(ev, 'emergency');
    const al = await adminL.next((c) => c.table === 'alerts');
    expect(toNotice(al, admin.id, () => 'ana')).toMatchObject({ title: 'EMERGÊNCIA', urgent: true });
    await expect(intrusoL.next((c) => c.table === 'alerts', 2500)).rejects.toThrow(/sem evento/);
  });

  it('Realtime não vaza coordenadas brutas (o app recarrega pela view filtrada)', async () => {
    const ev = (await admin.api.saveEvent({ name: `RT2 ${run}`, is_test: true, status: 'live' })).id;
    await bia.api.joinEvent(ev);
    const biaL = await listen(bia.api, `p-${run}`, ['participants'], bia.id);
    await ana.api.joinEvent(ev);
    await ana.api.startTracking(ev);
    await ana.api.pushPositions(ev, [{ lat: -12.95, lng: -38.35, accuracy: 5, recordedAt: new Date().toISOString() }], 0);
    const ch = await biaL.next((c) => c.new.user_id === ana.id && c.new.last_at != null);
    expect(ch.new.last_lat).toBeUndefined();
  });
});

describe('Edge Function log-ingest', () => {
  it('grava logs do logger do app; recusa sem login', async () => {
    const logger = createLogger({
      endpoint: `${URL}/functions/v1/log-ingest`,
      getAuthToken: async () => (await ana.c.auth.getSession()).data.session!.access_token,
      storage: memoryStore(),
      context: () => ({ app_version: `rt-${run}`, os: 'test' }),
      fetchImpl: ((u: string, init: RequestInit) => fetch(u, { ...init, headers: { ...init.headers, apikey: ANON } })) as typeof fetch,
    });
    await logger.error('gps.error', new Error('timeout'), { lat: -13, token: 'x' });
    await logger.flush();
    const { rows } = await db.query(`select event, level, error, meta from app_logs where app_version = $1`, [`rt-${run}`]);
    expect(rows).toEqual([{ event: 'gps.error', level: 'error', error: 'Error: timeout', meta: { token: '[redacted]' } }]);
    const anon = await fetch(`${URL}/functions/v1/log-ingest`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }, body: '[]' });
    expect(anon.status).toBe(401);
  });
});
