// Rotas da integração (dependências injetadas: banco, fetch, relógio) — testável sem Deno nem Strava real.
import {
  athleteName, authorizeUrl, FIRST_SYNC_DAYS, isAllowedReturn, needsRefresh, resultPage, signState, STRAVA,
  toActivityRow, verifyState, type StravaActivity,
} from './logic.ts';

export interface Tokens { access_token: string; refresh_token: string; expires_at: string }
export interface Store {
  userFromJwt(jwt: string): Promise<string | null>;
  saveConnection(userId: string, athleteId: number, name: string | null, t: Tokens): Promise<void>;
  tokens(userId: string): Promise<Tokens | null>;
  saveTokens(userId: string, t: Tokens): Promise<void>;
  userByAthlete(athleteId: number): Promise<string | null>;
  lastSync(userId: string): Promise<string | null>;
  upsertActivities(rows: ReturnType<typeof toActivityRow>[], userId: string, syncedAt?: string): Promise<void>;
  deleteActivity(id: number): Promise<void>;
  /** Apaga conta, tokens e atividades (desconexão ou revogação no Strava). */
  forget(userId: string): Promise<void>;
}
export interface Env { clientId: string; clientSecret: string; stateSecret: string; verifyToken: string; publicUrl: string }
export interface Deps { store: Store; env: Env; fetch: typeof fetch; now?: () => number; background?: (p: Promise<unknown>) => void }

const json = (body: unknown, status = 200) => Response.json(body, { status });
const toTokens = (t: { access_token: string; refresh_token: string; expires_at: number }): Tokens =>
  ({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(t.expires_at * 1000).toISOString() });

export function createHandler({ store, env, fetch, now = Date.now, background = (p) => void p }: Deps) {
  const redirectUri = `${env.publicUrl}/functions/v1/strava/callback`;

  async function oauthToken(params: Record<string, string>) {
    const r = await fetch(`${STRAVA}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.clientId, client_secret: env.clientSecret, ...params }),
    });
    if (!r.ok) throw new Error(`strava token ${r.status}`);
    return r.json();
  }

  /** Token válido (renova se preciso); null se a pessoa não está conectada. */
  async function accessToken(userId: string) {
    const t = await store.tokens(userId);
    if (!t) return null;
    if (!needsRefresh(t.expires_at, now())) return t.access_token;
    const fresh = toTokens(await oauthToken({ grant_type: 'refresh_token', refresh_token: t.refresh_token }));
    await store.saveTokens(userId, fresh);
    return fresh.access_token;
  }

  const get = (token: string, path: string) => fetch(`${STRAVA}/api/v3${path}`, { headers: { Authorization: `Bearer ${token}` } });

  async function sync(userId: string) {
    const token = await accessToken(userId);
    if (!token) return null;
    const last = await store.lastSync(userId);
    const after = Math.floor((last ? Date.parse(last) - 86_400_000 : now() - FIRST_SYNC_DAYS * 86_400_000) / 1000);
    const startedAt = new Date(now()).toISOString();
    let total = 0;
    for (let page = 1; page <= 5; page++) {
      const r = await get(token, `/athlete/activities?after=${after}&per_page=100&page=${page}`);
      if (r.status === 401) { await store.forget(userId); return null; } // acesso revogado no Strava
      if (!r.ok) throw new Error(`strava activities ${r.status}`);
      const list = (await r.json()) as StravaActivity[];
      await store.upsertActivities(list.map((a) => toActivityRow(userId, a)), userId, page === 1 ? startedAt : undefined);
      total += list.length;
      if (list.length < 100) break;
    }
    return total;
  }

  /** Eventos do webhook: o Strava não assina, então tudo é confirmado consultando a própria API. */
  async function onEvent(e: { object_type?: string; object_id?: number; aspect_type?: string; owner_id?: number; updates?: Record<string, string> }) {
    const userId = e.owner_id ? await store.userByAthlete(e.owner_id) : null;
    if (!userId) return;
    const token = await accessToken(userId);
    if (!token) return;
    if (e.object_type === 'athlete' && e.updates?.authorized === 'false') {
      if ((await get(token, '/athlete')).status === 401) await store.forget(userId);
      return;
    }
    if (e.object_type !== 'activity' || !e.object_id) return;
    const r = await get(token, `/activities/${e.object_id}`);
    if (r.ok) await store.upsertActivities([toActivityRow(userId, (await r.json()) as StravaActivity)], userId);
    else if (r.status === 404 && e.aspect_type === 'delete') await store.deleteActivity(e.object_id);
  }

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^.*\/strava\/?/, '');

    // Webhook do Strava: verificação da assinatura (GET) e eventos (POST, responder em < 2 s).
    if (route === 'webhook') {
      if (req.method === 'GET') {
        if (url.searchParams.get('hub.verify_token') !== env.verifyToken) return new Response('forbidden', { status: 403 });
        return json({ 'hub.challenge': url.searchParams.get('hub.challenge') });
      }
      const event = await req.json().catch(() => null);
      if (event) background(onEvent(event).catch((err) => console.error('strava webhook', err)));
      return json({ ok: true });
    }

    // Retorno do login no Strava (navegador; sem JWT — o usuário vem no `state` assinado).
    if (route === 'callback') {
      const state = await verifyState(env.stateSecret, url.searchParams.get('state'), now());
      const code = url.searchParams.get('code');
      const granted = (url.searchParams.get('scope') ?? '').split(',');
      const back = (ok: boolean) => {
        if (!state) return new Response(resultPage(false, null), { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        const sep = state.r.includes('?') ? '&' : '?';
        return Response.redirect(`${state.r}${sep}strava=${ok ? 'ok' : 'error'}`, 302);
      };
      if (!state || !code || url.searchParams.get('error') || !granted.includes('activity:read')) return back(false);
      try {
        const t = await oauthToken({ grant_type: 'authorization_code', code });
        await store.saveConnection(state.u, t.athlete.id, athleteName(t.athlete), toTokens(t));
        background(sync(state.u).catch((err) => console.error('strava first sync', err)));
        return back(true);
      } catch (err) {
        console.error('strava callback', err);
        return back(false);
      }
    }

    if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
    const userId = jwt ? await store.userFromJwt(jwt) : null;
    if (!userId) return new Response('unauthorized', { status: 401 });

    if (route === 'start') {
      const { returnUrl } = (await req.json().catch(() => ({}))) as { returnUrl?: string };
      if (!isAllowedReturn(returnUrl)) return json({ error: 'invalid returnUrl' }, 400);
      const state = await signState(env.stateSecret, { u: userId, r: returnUrl, exp: now() + 10 * 60_000 });
      return json({ url: authorizeUrl(env.clientId, redirectUri, state) });
    }
    if (route === 'sync') return json({ synced: await sync(userId) });
    if (route === 'disconnect') {
      const token = await accessToken(userId).catch(() => null);
      if (token) await fetch(`${STRAVA}/oauth/deauthorize`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
      await store.forget(userId);
      return json({ ok: true });
    }
    return new Response('not found', { status: 404 });
  };
}
