import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Change } from './notifications';
import type { AlertType, Checkpoint, Fix, Session, SessionStatus } from './types';

export interface LiveParticipant {
  session_id: string;
  user_id: string;
  display_name: string;
  status: string;
  sharing: boolean;
  distance_m: number;
  last_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
}

export interface Alert {
  id: string;
  session_id: string;
  user_id: string;
  type: AlertType;
  lat: number | null;
  lng: number | null;
  created_at: string;
  resolved_at: string | null;
}

export interface LogFilters {
  from?: string;
  to?: string;
  level?: string;
  event?: string;
  sessionId?: string;
  appVersion?: string;
  limit?: number;
}

/** Lança o erro do Supabase em vez de devolvê-lo (o logger registra a falha). */
function ok<R extends { data: unknown; error: unknown }>(r: R): NonNullable<R['data']> {
  if (r.error) throw r.error;
  return r.data as NonNullable<R['data']>;
}

/** Acesso a dados compartilhado por app e painel. As regras de permissão ficam no banco (RLS). */
export function createApi(db: SupabaseClient) {
  const me = async () => {
    const id = (await db.auth.getUser()).data.user?.id;
    if (!id) throw new Error('not authenticated');
    return id;
  };
  /** Atualiza a própria participação; o trigger do banco valida a transição. */
  const updateMine = async (sessionId: string, patch: Record<string, unknown>) => {
    const rows = ok(await db.from('participants').update(patch).eq('session_id', sessionId).eq('user_id', await me()).select('status'));
    // RLS bloqueia em silêncio (0 linhas); vira erro para aparecer nos logs.
    if (!rows.length) throw new Error('participation not found');
  };

  const api = {
    me,
    signUp: async (email: string, password: string, displayName: string) =>
      ok(await db.auth.signUp({ email, password, options: { data: { display_name: displayName } } })),
    signIn: async (email: string, password: string) => ok(await db.auth.signInWithPassword({ email, password })),
    signOut: () => db.auth.signOut(),
    profile: async () => ok(await db.from('profiles').select('id, display_name, role, pseudo_id').eq('id', await me()).single()),

    // ---------- sessões ----------
    publishedEvents: async () =>
      ok(await db.from('sessions').select('*').eq('kind', 'official').in('status', ['published', 'live']).order('starts_at')) as Session[],
    mySessions: async () =>
      ok(await db.from('sessions').select('*, participants!inner(status)').eq('participants.user_id', await me()).order('created_at', { ascending: false })),
    allEvents: async () => ok(await db.from('sessions').select('*').eq('kind', 'official').order('starts_at', { ascending: false })) as Session[],
    session: async (id: string) => ok(await db.from('sessions').select('*').eq('id', id).single()) as Session,
    saveEvent: async (s: Partial<Session> & { name: string }) =>
      ok(await db.from('sessions').upsert({ kind: 'official', owner_id: await me(), ...s }).select().single()) as Session,
    setStatus: async (id: string, status: SessionStatus) => ok(await db.from('sessions').update({ status }).eq('id', id)),
    deleteTestSession: async (id: string) => ok(await db.from('sessions').delete().eq('id', id).eq('is_test', true)),
    checkpoints: async (sessionId: string) =>
      ok(await db.from('checkpoints').select('*').eq('session_id', sessionId).order('km')) as Checkpoint[],
    /** Substitui todos os pontos de apoio do evento. */
    saveCheckpoints: async (sessionId: string, cps: Omit<Checkpoint, 'id' | 'session_id'>[]) => {
      ok(await db.from('checkpoints').delete().eq('session_id', sessionId));
      if (cps.length) ok(await db.from('checkpoints').insert(cps.map((c) => ({ ...c, session_id: sessionId }))));
    },

    // ---------- corridas privadas ----------
    createRace: async (name: string, friendIds: string[]) => {
      const owner = await me();
      const race = ok(await db.from('sessions').insert({ kind: 'private', name, owner_id: owner }).select().single()) as Session;
      ok(await db.from('participants').insert([
        { session_id: race.id, user_id: owner, status: 'accepted' },
        ...friendIds.map((user_id) => ({ session_id: race.id, user_id, status: 'invited' })),
      ]));
      return race;
    },
    respondInvite: async (sessionId: string, accept: boolean) =>
      updateMine(sessionId, { status: accept ? 'accepted' : 'declined' }),

    // ---------- participação / rastreamento ----------
    joinEvent: async (sessionId: string) =>
      ok(await db.from('participants').upsert({ session_id: sessionId, user_id: await me() }, { ignoreDuplicates: true })),
    startTracking: async (sessionId: string) =>
      updateMine(sessionId, { status: 'tracking', sharing: true }),
    setSharing: async (sessionId: string, sharing: boolean) => updateMine(sessionId, { sharing }),
    finish: async (sessionId: string) => updateMine(sessionId, { status: 'finished' }),
    pushPositions: async (sessionId: string, fixes: Fix[], distanceM: number) =>
      ok(await db.rpc('push_positions', { p_session: sessionId, p_fixes: fixes, p_distance_m: distanceM })),
    /** Status atual de todos os participantes visíveis (base do cache de avisos do painel). */
    participantStatuses: async () =>
      ok(await db.from('participants').select('session_id, user_id, status')) as { session_id: string; user_id: string; status: string }[],
    names: async (ids: string[]) =>
      ok(await db.from('profiles').select('id, display_name').in('id', ids)) as { id: string; display_name: string }[],
    live: async (sessionId: string) =>
      ok(await db.from('live_participants').select('*').eq('session_id', sessionId)) as LiveParticipant[],

    // ---------- alertas ----------
    raiseAlert: async (sessionId: string, type: Exclude<AlertType, 'signal_lost'>) =>
      ok(await db.rpc('raise_alert', { p_session: sessionId, p_type: type })) as string,
    alerts: async (sessionId: string) =>
      ok(await db.from('alerts').select('*').eq('session_id', sessionId).order('created_at', { ascending: false })) as Alert[],
    resolveAlert: async (id: string) => ok(await db.from('alerts').update({ resolved_at: new Date().toISOString() }).eq('id', id)),

    // ---------- amizades ----------
    searchPeople: async (q: string) =>
      ok(await db.from('profiles').select('id, display_name').ilike('display_name', `%${q}%`).neq('id', await me()).limit(20)),
    friendships: async () =>
      ok(await db.from('friendships').select('requester, addressee, status, req:profiles!requester(display_name), adr:profiles!addressee(display_name)')),
    requestFriend: async (userId: string) => ok(await db.from('friendships').insert({ requester: await me(), addressee: userId })),
    respondFriend: async (requester: string, accept: boolean) =>
      ok(await db.from('friendships').update({ status: accept ? 'accepted' : 'declined' }).eq('requester', requester).eq('addressee', await me())),

    // ---------- logs (admin) ----------
    logs: async (f: LogFilters = {}) => {
      let q = db.from('app_logs').select('*').order('ts', { ascending: false }).limit(f.limit ?? 500);
      if (f.from) q = q.gte('ts', f.from);
      if (f.to) q = q.lte('ts', f.to);
      if (f.level) q = q.eq('level', f.level);
      if (f.event) q = q.ilike('event', `${f.event}%`);
      if (f.sessionId) q = q.eq('session_id', f.sessionId);
      if (f.appVersion) q = q.eq('app_version', f.appVersion);
      return ok(await q);
    },

    /**
     * Mudanças ao vivo. Coordenadas não vêm pelo Realtime (coluna protegida):
     * o callback serve de gatilho para recarregar live_participants.
     */
    subscribe(name: string, tables: Change['table'][], onChange: (c: Change) => void, filter?: string): RealtimeChannel {
      const ch = db.channel(name);
      for (const table of tables)
        ch.on('postgres_changes' as never, { event: '*', schema: 'public', table, ...(filter && { filter }) }, (p: any) =>
          onChange({ table, eventType: p.eventType, new: p.new ?? {}, old: p.old ?? {} }),
        );
      return ch.subscribe();
    },
  };
  return api;
}

export type Api = ReturnType<typeof createApi>;
