-- Organização: só admin cria/opera eventos oficiais e só admin concede/retira admin (com auditoria).
-- Diretório de pessoas com estatísticas para a organização.

-- ---------- sessões: tipo e dono imutáveis ----------
-- Sem isso o dono de uma corrida privada conseguiria transformá-la em evento oficial (sessions_update só checa can_manage).
create function sessions_guard() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and (new.kind is distinct from old.kind or new.owner_id is distinct from old.owner_id) then
    raise exception 'kind and owner cannot change';
  end if;
  return new;
end $$;
create trigger sessions_guard before update on sessions for each row execute function sessions_guard();

-- ---------- papel: só via set_admin (ou service role) ----------
create table role_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles on delete cascade,
  actor uuid references profiles on delete set null,
  role text not null,
  at timestamptz not null default now()
);
alter table role_changes enable row level security;
create policy role_changes_read on role_changes for select to authenticated using (is_admin());

create function profiles_role_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is not null and coalesce(current_setting('mb.role_change', true), '') <> 'on' then
      raise exception 'role can only be changed by an admin';
    end if;
    insert into role_changes (user_id, actor, role) values (new.id, auth.uid(), new.role);
  end if;
  return new;
end $$;
create trigger profiles_role_guard before update of role on profiles for each row execute function profiles_role_guard();

/** Concede/retira organizador. Só admin; ninguém retira o próprio acesso (evita ficar sem admin). */
create function set_admin(p_user uuid, p_admin boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  if p_user = auth.uid() and not p_admin then raise exception 'cannot remove yourself'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'user not found'; end if;
  perform set_config('mb.role_change', 'on', true);
  update profiles set role = case when p_admin then 'admin' else 'user' end where id = p_user;
  perform set_config('mb.role_change', '', true);
end $$;

create or replace function set_staff(p_email text, p_admin boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'user not found'; end if;
  perform set_admin(uid, p_admin);
  return uid;
end $$;

/** Histórico de concessões/remoções de organizador (quem, por quem, quando). */
create function list_role_changes(p_limit int default 50) returns table (at timestamptz, user_name text, actor_name text, role text)
language sql stable security definer set search_path = public as $$
  select r.at, u.display_name, a.display_name, r.role
  from role_changes r join profiles u on u.id = r.user_id left join profiles a on a.id = r.actor
  where is_admin() order by r.at desc limit least(p_limit, 500)
$$;

-- ---------- diretório de pessoas ----------
/**
 * Uma linha por conta com contadores de participação. Só admin.
 * Evento = sessão oficial não-teste; corrida = sessão privada. "Iniciou" = rastreou (tracking/finished).
 */
create function admin_people() returns table (
  id uuid, display_name text, email text, role text, created_at timestamptz, last_sign_in_at timestamptz,
  phone text, has_photo boolean, registration_number text,
  events_joined int, events_started int, races_started int, total_km numeric,
  calls int, last_activity timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, u.email::text, p.role, p.created_at, u.last_sign_in_at,
    c.phone, c.photo_path is not null, c.registration_number,
    coalesce(s.events_joined, 0), coalesce(s.events_started, 0), coalesce(s.races_started, 0), round(coalesce(s.meters, 0)::numeric / 1000, 1),
    coalesce(a.calls, 0), s.last_activity
  from profiles p
  join auth.users u on u.id = p.id
  left join profile_contacts c on c.user_id = p.id
  left join lateral (
    select count(*) filter (where ss.kind = 'official' and pa.status in ('accepted', 'tracking', 'finished'))::int as events_joined,
           count(*) filter (where ss.kind = 'official' and pa.status in ('tracking', 'finished'))::int as events_started,
           count(*) filter (where ss.kind = 'private' and pa.status in ('tracking', 'finished'))::int as races_started,
           sum(pa.distance_m) filter (where pa.status in ('tracking', 'finished')) as meters,
           max(pa.last_at) as last_activity
    from participants pa join sessions ss on ss.id = pa.session_id
    where pa.user_id = p.id and not ss.is_test
  ) s on true
  left join lateral (
    select count(*)::int as calls from alerts al join sessions ss on ss.id = al.session_id
    where al.user_id = p.id and al.type <> 'signal_lost' and not ss.is_test
  ) a on true
  where is_admin()
  order by p.display_name
$$;

/** Participações de uma pessoa. Corridas privadas aparecem sem nome (privacidade entre amigos). */
create function admin_person_history(p_user uuid) returns table (
  session_id uuid, kind session_kind, name text, starts_at timestamptz, session_status session_status,
  status participant_status, distance_m double precision, is_test boolean
)
language sql stable security definer set search_path = public as $$
  select s.id, s.kind, case when s.kind = 'official' then s.name else 'Corrida privada' end, coalesce(s.starts_at, s.created_at),
    s.status, pa.status, pa.distance_m, s.is_test
  from participants pa join sessions s on s.id = pa.session_id
  where pa.user_id = p_user and is_admin() and pa.status not in ('invited', 'declined')
  order by coalesce(s.starts_at, s.created_at) desc
$$;

revoke execute on function admin_people(), admin_person_history(uuid), set_admin(uuid, boolean), list_role_changes(int) from anon, public;
grant execute on function admin_people(), admin_person_history(uuid), set_admin(uuid, boolean), list_role_changes(int) to authenticated;
