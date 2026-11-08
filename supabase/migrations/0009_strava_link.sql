-- Strava sem API (a API passou a exigir assinatura paga): a pessoa informa o link do próprio perfil.
-- Os mesmos consentimentos (opt-in) valem para o link: amigos e/ou organização.

alter table strava_accounts alter column athlete_id drop not null;
alter table strava_accounts add column profile_url text
  check (profile_url ~ '^https://(www\.strava\.com/athletes/[A-Za-z0-9_-]{1,40}|strava\.app\.link/[A-Za-z0-9_-]{1,40})$');
alter table strava_accounts add constraint strava_accounts_has_link check (athlete_id is not null or profile_url is not null);

-- O próprio usuário cria/edita só o link e os consentimentos (athlete_id continua exclusivo da Edge Function).
create policy strava_accounts_insert on strava_accounts for insert to authenticated with check (user_id = auth.uid());
create policy strava_accounts_delete on strava_accounts for delete to authenticated using (user_id = auth.uid() and athlete_id is null);
grant insert (user_id, profile_url, share_with_org, share_with_friends) on strava_accounts to authenticated;
grant update (profile_url) on strava_accounts to authenticated;
grant delete on strava_accounts to authenticated;

/** Link para abrir o perfil: o informado pela pessoa ou o derivado da conta conectada via API. */
create function strava_link(a strava_accounts) returns text language sql immutable as $$
  select coalesce(a.profile_url, 'https://www.strava.com/athletes/' || a.athlete_id)
$$;

drop function admin_people();
create function admin_people() returns table (
  id uuid, display_name text, email text, role text, created_at timestamptz, last_sign_in_at timestamptz,
  phone text, has_photo boolean, registration_number text,
  events_joined int, events_started int, races_started int, total_km numeric,
  calls int, last_activity timestamptz,
  strava_url text, strava_km_30d numeric
)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, u.email::text, p.role, p.created_at, u.last_sign_in_at,
    c.phone, c.photo_path is not null, c.registration_number,
    coalesce(s.events_joined, 0), coalesce(s.events_started, 0), coalesce(s.races_started, 0), round(coalesce(s.meters, 0)::numeric / 1000, 1),
    coalesce(a.calls, 0), s.last_activity,
    case when sa.user_id is not null then strava_link(sa) end,
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
