-- Ligação com o Strava. Termos da API do Strava: dados de um usuário só podem ser mostrados a ele,
-- salvo consentimento explícito. Por isso cada compartilhamento é um opt-in separado, desligado por padrão:
--   share_with_org     → organização vê as atividades (resumo) no painel/app;
--   share_with_friends → amigos aceitos veem o link do perfil Strava.

-- Tokens OAuth: só service role (Edge Function). Nenhuma role de cliente lê ou grava.
create table strava_tokens (
  user_id uuid primary key references profiles on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null
);
alter table strava_tokens enable row level security;
revoke all on strava_tokens from anon, authenticated;

create table strava_accounts (
  user_id uuid primary key references profiles on delete cascade,
  athlete_id bigint not null unique,
  athlete_name text,
  share_with_org boolean not null default false,
  share_with_friends boolean not null default false,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz
);
alter table strava_accounts enable row level security;
create policy strava_accounts_read on strava_accounts for select to authenticated using (
  user_id = auth.uid()
  or (share_with_org and is_admin())
  or (share_with_friends and are_friends(auth.uid(), user_id))
);
-- O próprio usuário só muda os consentimentos; conexão/desconexão passam pela Edge Function.
create policy strava_accounts_update on strava_accounts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on strava_accounts from anon, authenticated;
grant update (share_with_org, share_with_friends) on strava_accounts to authenticated;

-- Resumo de cada atividade (sem trajeto/GPS do Strava).
create table strava_activities (
  id bigint primary key, -- id da atividade no Strava
  user_id uuid not null references profiles on delete cascade,
  name text,
  sport_type text,
  start_date timestamptz not null,
  distance_m double precision not null default 0,
  moving_time_s int not null default 0,
  elapsed_time_s int not null default 0,
  elevation_gain_m double precision
);
create index on strava_activities (user_id, start_date desc);
alter table strava_activities enable row level security;
create policy strava_activities_read on strava_activities for select to authenticated using (
  user_id = auth.uid()
  or (is_admin() and exists (select 1 from strava_accounts a where a.user_id = strava_activities.user_id and a.share_with_org))
);
revoke insert, update, delete on strava_activities from anon, authenticated;

-- Retirar o consentimento da organização não apaga as atividades (são do próprio usuário); só deixa de expô-las.

-- ---------- diretório: perfil Strava quando compartilhado com a organização ----------
drop function admin_people();
create function admin_people() returns table (
  id uuid, display_name text, email text, role text, created_at timestamptz, last_sign_in_at timestamptz,
  phone text, has_photo boolean, registration_number text,
  events_joined int, events_started int, races_started int, total_km numeric,
  calls int, last_activity timestamptz,
  strava_athlete_id bigint, strava_km_30d numeric
)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, u.email::text, p.role, p.created_at, u.last_sign_in_at,
    c.phone, c.photo_path is not null, c.registration_number,
    coalesce(s.events_joined, 0), coalesce(s.events_started, 0), coalesce(s.races_started, 0), round(coalesce(s.meters, 0)::numeric / 1000, 1),
    coalesce(a.calls, 0), s.last_activity,
    sa.athlete_id,
    case when sa.athlete_id is not null then (
      select round(coalesce(sum(distance_m), 0)::numeric / 1000, 1) from strava_activities sx
      where sx.user_id = p.id and sx.start_date > now() - interval '30 days') end
  from profiles p
  join auth.users u on u.id = p.id
  left join profile_contacts c on c.user_id = p.id
  left join strava_accounts sa on sa.user_id = p.id and sa.share_with_org
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
revoke execute on function admin_people() from anon, public;
grant execute on function admin_people() to authenticated;
