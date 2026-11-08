// Integração Strava: OAuth (start/callback), sincronização, desconexão e webhook. Lógica em handler.ts.
import { createClient } from '@supabase/supabase-js';
import { createHandler, type Store } from './handler.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const must = (r: { error: unknown }) => { if (r.error) throw r.error; };

const store: Store = {
  userFromJwt: async (jwt) => (await db.auth.getUser(jwt)).data.user?.id ?? null,
  async saveConnection(userId, athleteId, name, t) {
    // Mesma conta Strava em outro usuário do app: a ligação antiga é desfeita.
    must(await db.from('strava_accounts').delete().eq('athlete_id', athleteId).neq('user_id', userId));
    must(await db.from('strava_accounts').upsert({ user_id: userId, athlete_id: athleteId, athlete_name: name }, { onConflict: 'user_id' }));
    must(await db.from('strava_tokens').upsert({ user_id: userId, ...t }));
  },
  tokens: async (userId) => (await db.from('strava_tokens').select('access_token, refresh_token, expires_at').eq('user_id', userId).maybeSingle()).data,
  saveTokens: async (userId, t) => must(await db.from('strava_tokens').update(t).eq('user_id', userId)),
  userByAthlete: async (id) => (await db.from('strava_accounts').select('user_id').eq('athlete_id', id).maybeSingle()).data?.user_id ?? null,
  lastSync: async (userId) => (await db.from('strava_accounts').select('last_sync_at').eq('user_id', userId).maybeSingle()).data?.last_sync_at ?? null,
  async upsertActivities(rows, userId, syncedAt) {
    if (rows.length) must(await db.from('strava_activities').upsert(rows));
    if (syncedAt) must(await db.from('strava_accounts').update({ last_sync_at: syncedAt }).eq('user_id', userId));
  },
  deleteActivity: async (id) => must(await db.from('strava_activities').delete().eq('id', id)),
  async forget(userId) {
    must(await db.from('strava_activities').delete().eq('user_id', userId));
    must(await db.from('strava_tokens').delete().eq('user_id', userId));
    must(await db.from('strava_accounts').delete().eq('user_id', userId));
  },
};

const env = {
  clientId: Deno.env.get('STRAVA_CLIENT_ID') ?? '',
  clientSecret: Deno.env.get('STRAVA_CLIENT_SECRET') ?? '',
  stateSecret: Deno.env.get('STRAVA_STATE_SECRET') ?? '',
  verifyToken: Deno.env.get('STRAVA_VERIFY_TOKEN') ?? '',
  // URL pública do projeto (o SUPABASE_URL interno do runtime local não é acessível pelo Strava).
  publicUrl: Deno.env.get('STRAVA_PUBLIC_URL') ?? Deno.env.get('SUPABASE_URL')!,
};

const handle = createHandler({
  store, env, fetch,
  // Responde ao Strava na hora e termina o trabalho em segundo plano.
  background: (p) => (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(p),
});

Deno.serve((req) => {
  // O app pergunta antes de mostrar o botão "Conectar com Strava".
  if (new URL(req.url).pathname.endsWith('/status')) return Response.json({ configured: Boolean(env.clientId && env.clientSecret && env.stateSecret) });
  if (!env.clientId || !env.clientSecret || !env.stateSecret) return new Response('strava not configured', { status: 503 });
  return handle(req);
});
