-- Missão Barra — schema do MVP. Um único modelo de "sessão" atende evento oficial e corrida privada.

create extension if not exists pg_cron;

create type session_kind as enum ('official', 'private');
create type session_status as enum ('draft', 'published', 'live', 'ended', 'archived');
create type participant_status as enum ('invited', 'accepted', 'declined', 'tracking', 'finished');
create type friendship_status as enum ('pending', 'accepted', 'declined');
create type alert_type as enum ('help', 'emergency', 'signal_lost');
create type checkpoint_kind as enum ('start', 'stop', 'finish');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  pseudo_id uuid not null default gen_random_uuid() unique, -- usado nos logs no lugar do id real
  created_at timestamptz not null default now()
);

create table friendships (
  requester uuid not null references profiles on delete cascade,
  addressee uuid not null references profiles on delete cascade,
  status friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  kind session_kind not null,
  name text not null,
  status session_status not null default 'draft',
  owner_id uuid not null references profiles,
  starts_at timestamptz,
  route jsonb, -- GeoJSON LineString
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create table checkpoints (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions on delete cascade,
  name text not null,
  km numeric not null,
  lat double precision not null,
  lng double precision not null,
  kind checkpoint_kind not null default 'stop'
);

create table participants (
  session_id uuid not null references sessions on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  status participant_status not null default 'accepted',
  sharing boolean not null default false,
  last_lat double precision,
  last_lng double precision,
  last_at timestamptz,
  distance_m double precision not null default 0,
  primary key (session_id, user_id)
);

-- Trilha operacional: separada dos logs técnicos, acesso restrito, retenção curta.
create table positions (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  user_id uuid not null,
  lat double precision not null,
  lng double precision not null,
  accuracy real,
  recorded_at timestamptz not null,
  foreign key (session_id, user_id) references participants on delete cascade
);
create index on positions (session_id, user_id, recorded_at);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions on delete cascade,
  user_id uuid not null references profiles,
  type alert_type not null,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Logs técnicos: sem coordenadas nem segredos (sanitizados no cliente e na ingestão).
create table app_logs (
  id bigint generated always as identity primary key,
  ts timestamptz not null,
  received_at timestamptz not null default now(),
  level text not null,
  event text not null,
  session_id uuid,
  pseudo_user uuid,
  app_version text,
  os text,
  device text,
  latency_ms int,
  error text,
  meta jsonb
);
create index on app_logs (ts desc);
create index on app_logs (session_id, ts);
create index on app_logs (event, ts);

-- ---------- helpers (security definer evita recursão de RLS) ----------
create function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

create function is_participant(s uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from participants where session_id = s and user_id = auth.uid() and status in ('accepted', 'tracking', 'finished'))
$$;

create function are_friends(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where status = 'accepted'
    and ((requester = a and addressee = b) or (requester = b and addressee = a)))
$$;

create function session_owner(s uuid) returns uuid language sql stable security definer set search_path = public as $$
  select owner_id from sessions where id = s
$$;

create function session_kind_of(s uuid) returns session_kind language sql stable security definer set search_path = public as $$
  select kind from sessions where id = s
$$;

-- Admin opera eventos oficiais; dono opera a própria corrida privada.
create function can_manage(s uuid) returns boolean language sql stable security definer set search_path = public as $$
  select (session_kind_of(s) = 'official' and is_admin()) or session_owner(s) = auth.uid()
$$;

-- Perfil criado automaticamente no cadastro.
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ---------- regras de transição ----------
create function participants_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  select * into s from sessions where id = new.session_id;
  -- Só o próprio usuário aceita/recusa convite e inicia o rastreamento (consentimento explícito).
  if auth.uid() is not null and auth.uid() <> new.user_id and new.status in ('accepted', 'declined', 'tracking')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if not (tg_op = 'INSERT' and new.status = 'accepted' and new.user_id = s.owner_id) then
      raise exception 'only the participant can change to %', new.status;
    end if;
  end if;
  if new.status = 'tracking' and s.status <> 'live' then
    raise exception 'session is not live';
  end if;
  -- Rastrear exige aceite prévio (convite recusado ou participação finalizada não volta).
  if new.status = 'tracking' and (tg_op = 'INSERT' or old.status not in ('accepted', 'tracking')) then
    raise exception 'must accept before tracking';
  end if;
  -- Ao sair, a localização deixa de ser compartilhada.
  if new.status in ('finished', 'declined', 'invited') then
    new.sharing := false;
  end if;
  -- Apenas o servidor (push_positions) atualiza última posição e distância.
  if tg_op = 'UPDATE' and auth.uid() is not null and current_setting('mb.push', true) is distinct from 'on'
     and (new.last_lat, new.last_lng, new.last_at, new.distance_m) is distinct from (old.last_lat, old.last_lng, old.last_at, old.distance_m) then
    raise exception 'position fields are server-managed';
  end if;
  return new;
end $$;
create trigger participants_guard before insert or update on participants for each row execute function participants_guard();

-- Encerrar a sessão encerra todos que ainda estão rastreando.
create function sessions_on_end() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('ended', 'archived') and old.status is distinct from new.status then
    update participants set status = 'finished' where session_id = new.id and status = 'tracking';
  end if;
  return new;
end $$;
create trigger sessions_on_end after update on sessions for each row execute function sessions_on_end();

-- Grava posição em lote e atualiza o "último ponto" numa única chamada (menos requisições = menos bateria).
create function push_positions(p_session uuid, p_fixes jsonb, p_distance_m double precision)
returns void language plpgsql security definer set search_path = public as $$
declare last_fix jsonb := p_fixes -> (jsonb_array_length(p_fixes) - 1);
begin
  if jsonb_array_length(p_fixes) = 0 then return; end if;
  if not exists (select 1 from participants where session_id = p_session and user_id = auth.uid() and status = 'tracking') then
    raise exception 'not tracking';
  end if;
  insert into positions (session_id, user_id, lat, lng, accuracy, recorded_at)
  select p_session, auth.uid(), (f->>'lat')::float8, (f->>'lng')::float8, (f->>'accuracy')::real, (f->>'recordedAt')::timestamptz
  from jsonb_array_elements(p_fixes) f;
  perform set_config('mb.push', 'on', true);
  update participants set last_lat = (last_fix->>'lat')::float8, last_lng = (last_fix->>'lng')::float8,
    last_at = (last_fix->>'recordedAt')::timestamptz, distance_m = distance_m + greatest(p_distance_m, 0)
  where session_id = p_session and user_id = auth.uid();
  perform set_config('mb.push', 'off', true);
end $$;

-- Ajuda/emergência usa a última posição conhecida do servidor.
create function raise_alert(p_session uuid, p_type alert_type) returns uuid
language plpgsql security definer set search_path = public as $$
declare p participants; aid uuid;
begin
  if p_type = 'signal_lost' then raise exception 'reserved type'; end if;
  if p_type = 'emergency' and session_kind_of(p_session) <> 'official' then raise exception 'emergency only in official events'; end if;
  select * into p from participants where session_id = p_session and user_id = auth.uid() and status in ('accepted', 'tracking');
  if not found then raise exception 'not a participant'; end if;
  insert into alerts (session_id, user_id, type, lat, lng) values (p_session, auth.uid(), p_type, p.last_lat, p.last_lng) returning id into aid;
  return aid;
end $$;

-- ---------- jobs (funções para poderem ser testadas) ----------
create function flag_lost_signals(p_after interval default '10 minutes') returns int
language sql security definer set search_path = public as $$
  with ins as (
    insert into alerts (session_id, user_id, type, lat, lng)
    select p.session_id, p.user_id, 'signal_lost', p.last_lat, p.last_lng
    from participants p join sessions s on s.id = p.session_id
    where s.kind = 'official' and s.status = 'live' and p.status = 'tracking' and p.last_at < now() - p_after
      and not exists (select 1 from alerts a where a.session_id = p.session_id and a.user_id = p.user_id
                      and a.type = 'signal_lost' and a.resolved_at is null)
    returning 1)
  select count(*)::int from ins
$$;

create function purge_old_data() returns void language sql security definer set search_path = public as $$
  delete from positions where recorded_at < now() - interval '30 days';
  delete from app_logs where ts < now() - interval '90 days';
$$;

revoke execute on function flag_lost_signals, purge_old_data from public, anon, authenticated;

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table friendships enable row level security;
alter table sessions enable row level security;
alter table checkpoints enable row level security;
alter table participants enable row level security;
alter table positions enable row level security;
alter table alerts enable row level security;
alter table app_logs enable row level security;

-- Perfis: nome visível a usuários logados (busca de amigos); só o próprio edita, e não pode virar admin.
create policy profiles_read on profiles for select to authenticated using (true);
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));

create policy friendships_read on friendships for select to authenticated using (auth.uid() in (requester, addressee));
create policy friendships_request on friendships for insert to authenticated with check (requester = auth.uid() and status = 'pending');
create policy friendships_answer on friendships for update to authenticated using (addressee = auth.uid());
create policy friendships_delete on friendships for delete to authenticated using (auth.uid() in (requester, addressee));

-- Sessões: oficiais publicadas visíveis a todos; privadas só para dono/participantes/convidados.
create policy sessions_read on sessions for select to authenticated using (
  owner_id = auth.uid()
  or (kind = 'official' and (is_admin() or status in ('published', 'live')))
  or exists (select 1 from participants where session_id = id and user_id = auth.uid())
);
create policy sessions_insert on sessions for insert to authenticated with check (
  owner_id = auth.uid() and (kind = 'private' or is_admin())
);
create policy sessions_update on sessions for update to authenticated using (can_manage(id));
create policy sessions_delete on sessions for delete to authenticated using (is_test and can_manage(id));

create policy checkpoints_read on checkpoints for select to authenticated using (true);
create policy checkpoints_write on checkpoints for all to authenticated using (can_manage(session_id)) with check (can_manage(session_id));

create policy participants_read on participants for select to authenticated using (
  user_id = auth.uid() or is_participant(session_id) or can_manage(session_id)
);
-- Entrar em evento oficial, ou dono convidar amigo aceito em corrida privada.
create policy participants_insert on participants for insert to authenticated with check (
  (user_id = auth.uid() and session_kind_of(session_id) = 'official'
     and exists (select 1 from sessions s where s.id = session_id and s.status in ('published', 'live')))
  or (session_owner(session_id) = auth.uid() and session_kind_of(session_id) = 'private'
     and (user_id = auth.uid() or (status = 'invited' and are_friends(auth.uid(), user_id))))
);
-- Cada um muda o próprio estado; dono/admin podem finalizar (o trigger valida as transições).
create policy participants_update on participants for update to authenticated using (
  user_id = auth.uid() or can_manage(session_id)
);

-- Coordenadas brutas não são lidas direto da tabela: só via live_participants.
revoke select on participants from anon, authenticated;
grant select (session_id, user_id, status, sharing, last_at, distance_m) on participants to authenticated;

-- Trilha completa: só quem administra o evento oficial; escrita apenas via push_positions().
revoke insert, update, delete on positions from anon, authenticated;
create policy positions_read on positions for select to authenticated using (
  session_kind_of(session_id) = 'official' and is_admin()
);

create policy alerts_read on alerts for select to authenticated using (
  user_id = auth.uid() or is_participant(session_id) or can_manage(session_id)
);
create policy alerts_resolve on alerts for update to authenticated using (can_manage(session_id));
revoke insert on alerts from anon, authenticated; -- criação via raise_alert()

-- Logs: escrita só pela Edge Function (service role); leitura só admin.
create policy app_logs_read on app_logs for select to authenticated using (is_admin());
revoke insert, update, delete on app_logs from anon, authenticated;

-- Mapa ao vivo. Roda como dono da view (lê coordenadas) e aplica as regras de acesso aqui.
create view live_participants as
select p.session_id, p.user_id, pr.display_name, p.status, p.sharing, p.distance_m, p.last_at,
  case when show then p.last_lat end as last_lat,
  case when show then p.last_lng end as last_lng
from participants p
join profiles pr on pr.id = p.user_id
join sessions s on s.id = p.session_id
cross join lateral (select
  p.user_id = auth.uid()
  or (p.status = 'tracking' and p.sharing)
  or (s.kind = 'official' and is_admin()) as show) v
where p.user_id = auth.uid() or is_participant(p.session_id) or can_manage(p.session_id);
revoke all on live_participants from anon;
grant select on live_participants to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime add table participants, alerts, friendships;

-- ---------- agendamentos ----------
select cron.schedule('purge-old-data', '0 4 * * *', 'select purge_old_data()');
select cron.schedule('signal-lost', '* * * * *', 'select flag_lost_signals()');
