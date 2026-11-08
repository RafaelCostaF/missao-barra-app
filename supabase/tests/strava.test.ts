import { describe, expect, it } from 'vitest';
import { createHandler, type Store, type Tokens } from '../functions/strava/handler';
import { isAllowedReturn, needsRefresh, signState, toActivityRow, verifyState } from '../functions/strava/logic';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const env = { clientId: '123', clientSecret: 'shh', stateSecret: 'state-secret', verifyToken: 'vt', publicUrl: 'https://proj.supabase.co' };
const BASE = 'https://proj.supabase.co/functions/v1/strava';

/** Banco em memória com a mesma interface do Store real. */
function memoryStore() {
  const accounts = new Map<string, { athlete_id: number; name: string | null; last_sync_at: string | null }>();
  const tokens = new Map<string, Tokens>();
  const activities = new Map<number, ReturnType<typeof toActivityRow>>();
  const store: Store = {
    userFromJwt: async (jwt) => (jwt.startsWith('jwt-') ? jwt.slice(4) : null),
    saveConnection: async (u, id, name, t) => { accounts.set(u, { athlete_id: id, name, last_sync_at: null }); tokens.set(u, t); },
    tokens: async (u) => tokens.get(u) ?? null,
    saveTokens: async (u, t) => void tokens.set(u, t),
    userByAthlete: async (id) => [...accounts].find(([, a]) => a.athlete_id === id)?.[0] ?? null,
    lastSync: async (u) => accounts.get(u)?.last_sync_at ?? null,
    upsertActivities: async (rows, u, at) => { rows.forEach((r) => activities.set(r.id, r)); if (at) accounts.get(u)!.last_sync_at = at; },
    deleteActivity: async (id) => void activities.delete(id),
    forget: async (u) => { accounts.delete(u); tokens.delete(u); [...activities].filter(([, a]) => a.user_id === u).forEach(([id]) => activities.delete(id)); },
  };
  return { store, accounts, tokens, activities };
}

const run = { id: 9001, name: 'Treino orla', sport_type: 'Run', start_date: '2026-11-07T06:00:00Z', distance: 10230.5, moving_time: 3300, elapsed_time: 3500, total_elevation_gain: 12, map: { summary_polyline: 'xyz' } };

/** Strava falso: registra as chamadas e responde por rota. */
function fakeStrava(routes: Record<string, (init?: RequestInit) => Response>) {
  const calls: string[] = [];
  const fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url.replace('https://www.strava.com', '')}`);
    const key = Object.keys(routes).find((k) => url.includes(k));
    return key ? routes[key](init) : new Response('nope', { status: 404 });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

async function connect(h: (r: Request) => Promise<Response>, user = 'ana') {
  const start = await h(new Request(`${BASE}/start`, { method: 'POST', headers: { Authorization: `Bearer jwt-${user}` }, body: JSON.stringify({ returnUrl: 'exp://192.168.0.2:8081/--/perfil' }) }));
  const { url } = await start.json();
  const state = new URL(url).searchParams.get('state')!;
  return h(new Request(`${BASE}/callback?code=abc&scope=read,activity:read&state=${encodeURIComponent(state)}`));
}

describe('strava: regras', () => {
  it('state assinado expira e não aceita adulteração nem retorno para outro site', async () => {
    const s = await signState('k', { u: 'ana', r: 'missaobarra://perfil', exp: NOW + 1000 });
    expect((await verifyState('k', s, NOW))?.u).toBe('ana');
    expect(await verifyState('k', s, NOW + 2000)).toBeNull();
    expect(await verifyState('outra', s, NOW)).toBeNull();
    expect(await verifyState('k', `${s.split('.')[0]}x.${s.split('.')[1]}`, NOW)).toBeNull();
    expect(isAllowedReturn('https://evil.com')).toBe(false);
    expect(isAllowedReturn('exp://u.expo.dev/x')).toBe(true);
  });
  it('guarda só o resumo da atividade (sem trajeto)', () => {
    const row = toActivityRow('ana', run);
    expect(row).toEqual({ id: 9001, user_id: 'ana', name: 'Treino orla', sport_type: 'Run', start_date: run.start_date, distance_m: 10230.5, moving_time_s: 3300, elapsed_time_s: 3500, elevation_gain_m: 12 });
    expect(JSON.stringify(row)).not.toContain('xyz');
    expect(needsRefresh(new Date(NOW + 60_000).toISOString(), NOW)).toBe(true);
  });
});

describe('strava: fluxo', () => {
  const tokenResp = () => Response.json({ access_token: 'acc1', refresh_token: 'ref1', expires_at: NOW / 1000 + 6 * 3600, athlete: { id: 77, firstname: 'Ana', lastname: 'Souza' } });

  it('conecta, volta para o app e sincroniza as atividades', async () => {
    const m = memoryStore();
    const s = fakeStrava({ '/oauth/token': tokenResp, '/athlete/activities': () => Response.json([run]) });
    const pending: Promise<unknown>[] = [];
    const h = createHandler({ store: m.store, env, fetch: s.fetch, now: () => NOW, background: (p) => pending.push(p) });
    const res = await connect(h);
    await Promise.all(pending);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('exp://192.168.0.2:8081/--/perfil?strava=ok');
    expect(m.accounts.get('ana')).toMatchObject({ athlete_id: 77, name: 'Ana Souza' });
    expect(m.activities.get(9001)?.distance_m).toBe(10230.5);
    expect(s.calls.find((c) => c.includes('/athlete/activities'))).toMatch(/after=\d+/);
  });

  it('recusa sem permissão de atividades, state inválido ou sem login', async () => {
    const m = memoryStore();
    const h = createHandler({ store: m.store, env, fetch: fakeStrava({}).fetch, now: () => NOW });
    const st = await signState(env.stateSecret, { u: 'ana', r: 'missaobarra://perfil', exp: NOW + 60_000 });
    const noScope = await h(new Request(`${BASE}/callback?code=abc&scope=read&state=${st}`));
    expect(noScope.headers.get('location')).toBe('missaobarra://perfil?strava=error');
    expect((await h(new Request(`${BASE}/callback?code=abc&scope=read,activity:read&state=forjado.x`))).status).toBe(400);
    expect((await h(new Request(`${BASE}/sync`, { method: 'POST' }))).status).toBe(401);
    const bad = await h(new Request(`${BASE}/start`, { method: 'POST', headers: { Authorization: 'Bearer jwt-ana' }, body: JSON.stringify({ returnUrl: 'https://evil.com' }) }));
    expect(bad.status).toBe(400);
    expect(m.accounts.size).toBe(0);
  });

  it('renova token vencido antes de sincronizar', async () => {
    const m = memoryStore();
    m.accounts.set('ana', { athlete_id: 77, name: null, last_sync_at: null });
    m.tokens.set('ana', { access_token: 'old', refresh_token: 'ref0', expires_at: new Date(NOW - 1000).toISOString() });
    let auth = '';
    const s = fakeStrava({
      '/oauth/token': (init) => { expect(String(init?.body)).toContain('grant_type=refresh_token'); return tokenResp(); },
      '/athlete/activities': () => Response.json([]),
    });
    const h = createHandler({ store: m.store, env, fetch: (async (u: string, i?: RequestInit) => { auth = String((i?.headers as Record<string, string>)?.Authorization ?? auth); return s.fetch(u, i); }) as typeof fetch, now: () => NOW });
    const r = await h(new Request(`${BASE}/sync`, { method: 'POST', headers: { Authorization: 'Bearer jwt-ana' } }));
    expect(await r.json()).toEqual({ synced: 0 });
    expect(m.tokens.get('ana')?.access_token).toBe('acc1');
    expect(auth).toBe('Bearer acc1');
  });

  it('webhook: valida inscrição, cria/apaga atividade só se o Strava confirmar e esquece quem revogou', async () => {
    const m = memoryStore();
    let exists = true, revoked = false;
    const s = fakeStrava({
      '/oauth/token': tokenResp,
      '/athlete/activities': () => Response.json([]),
      '/activities/9001': () => (exists ? Response.json(run) : new Response('', { status: 404 })),
      '/api/v3/athlete': () => new Response('', { status: revoked ? 401 : 200 }),
    });
    const pending: Promise<unknown>[] = [];
    const h = createHandler({ store: m.store, env, fetch: s.fetch, now: () => NOW, background: (p) => pending.push(p) });
    await connect(h);
    await Promise.all(pending);

    expect((await h(new Request(`${BASE}/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=c`))).status).toBe(403);
    expect(await (await h(new Request(`${BASE}/webhook?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=c1`))).json()).toEqual({ 'hub.challenge': 'c1' });

    const post = async (e: object) => { await h(new Request(`${BASE}/webhook`, { method: 'POST', body: JSON.stringify(e) })); await Promise.all(pending); };
    await post({ object_type: 'activity', object_id: 9001, aspect_type: 'create', owner_id: 77 });
    expect(m.activities.has(9001)).toBe(true);
    await post({ object_type: 'activity', object_id: 9001, aspect_type: 'delete', owner_id: 77 }); // forjado: ainda existe no Strava
    expect(m.activities.has(9001)).toBe(true);
    exists = false;
    await post({ object_type: 'activity', object_id: 9001, aspect_type: 'delete', owner_id: 77 });
    expect(m.activities.has(9001)).toBe(false);

    await post({ object_type: 'athlete', object_id: 77, aspect_type: 'update', owner_id: 77, updates: { authorized: 'false' } }); // forjado
    expect(m.accounts.has('ana')).toBe(true);
    revoked = true;
    await post({ object_type: 'athlete', object_id: 77, aspect_type: 'update', owner_id: 77, updates: { authorized: 'false' } });
    expect(m.accounts.has('ana')).toBe(false);
    expect(m.tokens.has('ana')).toBe(false);
  });

  it('desconectar revoga no Strava e apaga tudo', async () => {
    const m = memoryStore();
    const s = fakeStrava({ '/oauth/token': tokenResp, '/athlete/activities': () => Response.json([run]), '/oauth/deauthorize': () => Response.json({}) });
    const pending: Promise<unknown>[] = [];
    const h = createHandler({ store: m.store, env, fetch: s.fetch, now: () => NOW, background: (p) => pending.push(p) });
    await connect(h);
    await Promise.all(pending);
    expect(m.activities.size).toBe(1);
    await h(new Request(`${BASE}/disconnect`, { method: 'POST', headers: { Authorization: 'Bearer jwt-ana' } }));
    expect(s.calls).toContain('POST /oauth/deauthorize');
    expect(m.accounts.size + m.tokens.size + m.activities.size).toBe(0);
  });
});
