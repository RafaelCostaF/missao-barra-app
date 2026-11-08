import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { ParticipantSummary } from './audit';
import type { Contact } from './people';
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
  battery?: number | null;
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
    pushPositions: async (sessionId: string, fixes: Fix[], distanceM: number, battery?: number | null) =>
      ok(await db.rpc('push_positions', { p_session: sessionId, p_fixes: fixes, p_distance_m: distanceM, ...(battery != null && { p_battery: battery }) })),
    /** Organização finaliza a participação de alguém (desistência, celular descarregado). */
    finishFor: async (sessionId: string, userId: string) => {
      const rows = ok(await db.from('participants').update({ status: 'finished' }).eq('session_id', sessionId).eq('user_id', userId).select('status'));
      if (!rows.length) throw new Error('participation not found');
    },
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
    /** Alertas abertos de todas as sessões visíveis (central de alertas do painel). */
    openAlerts: async () =>
      ok(await db.from('alerts').select('*, sessions(name), profiles!alerts_user_id_fkey(display_name)').is('resolved_at', null).order('created_at', { ascending: false })) as
        (Alert & { sessions: { name: string } | null; profiles: { display_name: string } | null })[],
    resolveAlert: async (id: string) => ok(await db.from('alerts').update({ resolved_at: new Date().toISOString() }).eq('id', id)),

    // ---------- relatório e auditoria ----------
    report: async (sessionId: string) => ok(await db.rpc('session_report', { p_session: sessionId })) as ParticipantSummary[],
    timeline: async (sessionId: string, userId: string) =>
      ok(await db.from('participant_events').select('event, actor, at').eq('session_id', sessionId).eq('user_id', userId).order('at')) as
        { event: string; actor: string | null; at: string }[],

    // ---------- perfil e contato ----------
    myContact: async () => ok(await db.from('profile_contacts').select('*').eq('user_id', await me()).maybeSingle()) as Contact | null,
    /** Campos editáveis pelo próprio usuário. Celular em E.164 (+55…); trocar o número desfaz a verificação. */
    saveMyContact: async (c: Partial<Pick<Contact, 'phone' | 'registration_number' | 'emergency_name' | 'emergency_phone' | 'photo_path' | 'health_notes'>>) => {
      const user_id = await me();
      const { data } = await db.from('profile_contacts').select('user_id').eq('user_id', user_id).maybeSingle();
      ok(data ? await db.from('profile_contacts').update(c).eq('user_id', user_id) : await db.from('profile_contacts').insert({ ...c, user_id }));
    },
    /** Passo 1 da verificação: envia SMS com código de 6 dígitos para o celular (E.164). */
    requestPhoneCode: async (phoneE164: string) => ok(await db.auth.updateUser({ phone: phoneE164 })),
    /** Passo 2: confirma o código; o banco passa a ter o celular como verificado. */
    confirmPhoneCode: async (phoneE164: string, code: string) =>
      ok(await db.auth.verifyOtp({ phone: phoneE164, token: code.trim(), type: 'phone_change' })),
    /** Foto (JPEG já reduzida no cliente) em bucket privado: avatars/<user>/foto-<ts>.jpg. */
    uploadPhoto: async (bytes: ArrayBuffer) => {
      const path = `${await me()}/foto-${Date.now()}.jpg`;
      ok(await db.storage.from('avatars').upload(path, bytes, { contentType: 'image/jpeg', upsert: true }));
      return path;
    },
    /** URL temporária (1 h) para exibir a foto; só dono e organização conseguem gerar. */
    photoUrl: async (path: string) => ok(await db.storage.from('avatars').createSignedUrl(path, 3600)).signedUrl,
    staff: async () => ok(await db.rpc('list_staff')) as { id: string; display_name: string; email: string }[],
    setStaff: async (email: string, admin: boolean) => ok(await db.rpc('set_staff', { p_email: email, p_admin: admin })),
    setDisplayName: async (name: string) => ok(await db.from('profiles').update({ display_name: name }).eq('id', await me())),
    /** Contatos dos participantes (somente organização; RLS). */
    contacts: async (userIds: string[]) =>
      userIds.length ? (ok(await db.from('profile_contacts').select('*').in('user_id', userIds)) as Contact[]) : [],

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
