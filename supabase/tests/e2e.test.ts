// Ponta a ponta com o mesmo código do app: createApi (supabase-js) → gateway → GoTrue/PostgREST → Postgres.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createApi, createLogger, createPositionQueue, createTracker, memoryStore, summarize, type Api, type Fix } from '@mb/core';
import { anonKey, startGateway } from './gateway';
import { pool, sys } from './helpers';

let gw: Awaited<ReturnType<typeof startGateway>>;
const run = Date.now().toString(36);

/** Um "aparelho": cliente Supabase + logger + fila + rastreador, com GPS e rede simulados. */
function device(name: string) {
  const db = createClient(gw.url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const api = createApi(db);
  let online = true;
  const net = <T,>(fn: () => Promise<T>) => (online ? fn() : Promise.reject(new TypeError('Network request failed')));
  const logger = createLogger({
    endpoint: `${gw.url}/functions/v1/log-ingest`,
    getAuthToken: async () => (await db.auth.getSession()).data.session?.access_token ?? null,
    storage: memoryStore(),
    context: () => ({ app_version: 'e2e-1.0.0', os: 'test', device: name }),
    fetchImpl: ((url: string, init: RequestInit) => net(() => fetch(url, init))) as typeof fetch,
  });
  const queue = createPositionQueue(memoryStore(), (s, f, d) => net(() => api.pushPositions(s, f, d)), logger);
  const location = { requestPermission: vi.fn(async () => 'granted' as const), start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
  const tracker = createTracker({ location, api: { startTracking: (s) => net(() => api.startTracking(s)), finish: api.finish }, queue, logger });
  return {
    api, logger, queue, tracker, location,
    email: `${name}-${run}@teste.dev`,
    setOnline: (v: boolean) => (online = v),
    signUp() {
      return api.signUp(this.email, 'senha-forte-123', name);
    },
  };
}

/** Caminhada simulada ao longo da orla: um fix a cada 20 s, ~1,4 m/s. */
function walk(n: number, startMeters = 0): Fix[] {
  return Array.from({ length: n }, (_, i) => ({
    lat: -12.9570655,
    lng: -38.3536886 - (startMeters + i * 28) / 108_000,
    accuracy: 8,
    recordedAt: new Date(Date.now() - (n - i) * 20_000).toISOString(),
  }));
}

let admin: ReturnType<typeof device>, ana: ReturnType<typeof device>, bia: ReturnType<typeof device>;
const id = async (a: Api) => a.me();

beforeAll(async () => {
  gw = await startGateway();
  [admin, ana, bia] = [device('admin'), device('ana'), device('bia')];
  for (const d of [admin, ana, bia]) await d.signUp(); // cadastro real no GoTrue (autoconfirm)
  await sys(`update profiles set role = 'admin' where id = $1`, [await id(admin.api)]);
});
afterAll(async () => {
  await gw.close();
  await pool.end();
});

describe('cadastro e login', () => {
  it('cria perfil com o nome informado e entra com a senha', async () => {
    expect(await ana.api.profile()).toMatchObject({ display_name: 'ana', role: 'user' });
    const other = device('ana');
    await expect(other.api.signIn(ana.email, 'errada')).rejects.toThrow();
    await other.api.signIn(ana.email, 'senha-forte-123');
    expect(await other.api.me()).toBe(await ana.api.me());
  });
});

describe('evento oficial ponta a ponta', () => {
  let ev: string;

  it('admin cria, configura o percurso, publica e inicia', async () => {
    ev = (await admin.api.saveEvent({ name: `Ensaio ${run}`, starts_at: new Date().toISOString(), is_test: true })).id;
    await admin.api.saveCheckpoints(ev, [
      { name: 'Farol de Itapuã', km: 0, lat: -12.9570655, lng: -38.3536886, kind: 'start' },
      { name: 'Praia do Corsário', km: 6, lat: -12.9681066, lng: -38.4057227, kind: 'stop' },
      { name: 'Farol da Barra', km: 30, lat: -13.0101987, lng: -38.5329168, kind: 'finish' },
    ]);
    expect(await ana.api.checkpoints(ev)).toHaveLength(3);
    expect((await ana.api.publishedEvents()).map((e) => e.id)).not.toContain(ev);
    await admin.api.setStatus(ev, 'published');
    expect((await ana.api.publishedEvents()).map((e) => e.id)).toContain(ev);
    await expect(ana.api.setStatus(ev, 'live')).resolves.toBeDefined(); // RLS: nada muda
    expect((await admin.api.session(ev)).status).toBe('published');
    await admin.api.setStatus(ev, 'live');
  });

  it('participante entra, rastreia 30 min com queda de internet e o admin acompanha', async () => {
    await ana.api.joinEvent(ev);
    expect(await ana.tracker.start(ev)).toBe('tracking');
    const fixes = walk(90);
    for (const f of fixes.slice(0, 30)) await ana.tracker.onFixes([f]);
    ana.setOnline(false); // túnel / sem sinal de dados
    for (const f of fixes.slice(30, 60)) await ana.tracker.onFixes([f]);
    expect((await ana.queue.state()).pending).toBe(30);
    ana.setOnline(true);
    await ana.tracker.onConnectivity(true);
    for (const f of fixes.slice(60)) await ana.tracker.onFixes([f]);

    const [me] = (await admin.api.live(ev)).filter((p) => p.display_name === 'ana');
    expect(me.status).toBe('tracking');
    expect(me.last_lng).toBeCloseTo(fixes.at(-1)!.lng, 6);
    expect(me.distance_m).toBeGreaterThan(2400); // 89 × 28 m ≈ 2,5 km
    expect(me.distance_m).toBeLessThan(2600);
    const [{ n }] = await sys(`select count(*)::int n from positions where session_id = $1`, [ev]);
    expect(n).toBe(90);
  });

  it('emergência: aparece para o admin com posição, e ele resolve', async () => {
    await ana.api.raiseAlert(ev, 'emergency');
    const [a] = await admin.api.alerts(ev);
    expect(a).toMatchObject({ type: 'emergency', resolved_at: null });
    expect(a.lat).not.toBeNull();
    expect(summarize(await admin.api.live(ev), await admin.api.alerts(ev)).emergencies).toBe(1);
    await admin.api.resolveAlert(a.id);
    expect((await admin.api.alerts(ev))[0].resolved_at).not.toBeNull();
  });

  it('finalizar para o compartilhamento; admin encerra o evento', async () => {
    await ana.tracker.finish();
    const [me] = (await ana.api.live(ev)).filter((p) => p.display_name === 'ana');
    expect(me).toMatchObject({ status: 'finished', sharing: false });
    await admin.api.setStatus(ev, 'ended');
    expect((await admin.api.session(ev)).status).toBe('ended');
  });

  it('logs técnicos chegam na nuvem com sessão, versão e latência — sem coordenadas', async () => {
    await ana.logger.flush();
    const logs = await admin.api.logs({ sessionId: undefined, appVersion: 'e2e-1.0.0', event: 'positions.' });
    const events = logs.map((l: any) => `${l.event}:${l.level}`);
    expect(events).toEqual(expect.arrayContaining(['positions.push:info', 'positions.push:error', 'positions.queued:warn']));
    expect(logs.find((l: any) => l.event === 'positions.push' && l.level === 'info').latency_ms).toBeGreaterThanOrEqual(0);
    const all = await admin.api.logs({ appVersion: 'e2e-1.0.0' });
    expect(all.map((l: any) => l.event)).toEqual(expect.arrayContaining(['session.start', 'session.end', 'net.online']));
    expect(JSON.stringify(all)).not.toMatch(/-38\.35|-12\.95/);
    expect(await ana.api.logs()).toHaveLength(0); // só admin lê
  });
});

describe('corrida privada ponta a ponta', () => {
  let race: string;

  it('amizade: solicitar e aceitar', async () => {
    await ana.api.requestFriend(await bia.api.me());
    const [req] = (await bia.api.friendships()) as any[];
    expect(req).toMatchObject({ status: 'pending', req: { display_name: 'ana' } });
    await bia.api.respondFriend(await ana.api.me(), true);
    expect(((await ana.api.friendships()) as any[])[0].status).toBe('accepted');
  });

  it('cria corrida, convida, aceita e corre junto vendo o outro no mapa', async () => {
    race = (await ana.api.createRace(`Treino ${run}`, [await bia.api.me()])).id;
    const invites = (await bia.api.mySessions()).filter((s: any) => s.id === race);
    expect(invites[0].participants[0].status).toBe('invited');
    expect(await bia.tracker.start(race)).toBe('error'); // ainda não aceitou / não começou
    await bia.api.respondInvite(race, true);
    await ana.api.setStatus(race, 'live');
    expect(await ana.tracker.start(race)).toBe('tracking');
    expect(await bia.tracker.start(race)).toBe('tracking');
    await ana.tracker.onFixes(walk(5));
    const seen = (await bia.api.live(race)).find((p) => p.display_name === 'ana')!;
    expect(seen.last_lat).not.toBeNull();
    expect(await admin.api.live(race)).toHaveLength(0); // privada: nem o admin vê
  });

  it('ajuda sim, emergência não; criador encerra para todos', async () => {
    await bia.api.raiseAlert(race, 'help');
    expect((await ana.api.alerts(race))[0].type).toBe('help');
    await expect(bia.api.raiseAlert(race, 'emergency')).rejects.toThrow(/official/);
    await ana.tracker.finish();
    await ana.api.setStatus(race, 'ended');
    const rows = await ana.api.live(race);
    expect(rows.every((r) => r.status === 'finished' && !r.sharing)).toBe(true);
    // O aparelho da bia ainda manda posições: servidor recusa e o app desliga o GPS sozinho.
    await bia.tracker.onFixes(walk(2));
    expect(bia.tracker.state).toBe('finished');
    expect(bia.location.stop).toHaveBeenCalled();
    expect(await bia.queue.activeSession()).toBeNull();
  });
});
