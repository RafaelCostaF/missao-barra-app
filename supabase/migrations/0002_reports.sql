-- Relatórios e auditoria do percurso por participante.
-- positions é apagada em 30 dias; participant_summaries guarda o resumo de cada participante por 2 anos.

-- ---------- auditoria ----------
-- Linha do tempo de cada participante: entrada, aceite, início, fim, liga/desliga compartilhamento.
create table participant_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references sessions on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  event text not null,
  actor uuid, -- quem fez a mudança (o próprio, dono/admin ou null = sistema)
  at timestamptz not null default now()
);
create index on participant_events (session_id, user_id, at);

create function participants_audit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into participant_events (session_id, user_id, event, actor) values (new.session_id, new.user_id, new.status::text, auth.uid());
  end if;
  if tg_op = 'UPDATE' and old.sharing is distinct from new.sharing then
    insert into participant_events (session_id, user_id, event, actor) values (new.session_id, new.user_id, case when new.sharing then 'sharing_on' else 'sharing_off' end, auth.uid());
  end if;
  return new;
end $$;
create trigger participants_audit after insert or update on participants for each row execute function participants_audit();

-- Quem resolveu cada alerta (tempo de resposta = resolved_at - created_at).
alter table alerts add column resolved_by uuid references profiles;
create function alerts_resolved_by() returns trigger language plpgsql as $$
begin
  if new.resolved_at is not null and old.resolved_at is null then new.resolved_by := auth.uid(); end if;
  return new;
end $$;
create trigger alerts_resolved_by before update on alerts for each row execute function alerts_resolved_by();

-- ---------- relatório ----------
create table participant_summaries (
  session_id uuid not null references sessions on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  display_name text not null,
  status text not null,
  started_at timestamptz,
  finished_at timestamptz,
  duration_s int,
  distance_m double precision,
  positions int not null default 0,
  max_gap_s int,
  alerts_help int not null default 0,
  alerts_emergency int not null default 0,
  alerts_signal_lost int not null default 0,
  passages jsonb not null default '[]', -- [{name, km, at, elapsed_s}]
  snapshot_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

/** Passagem pelo ponto de apoio = primeira posição a até 150 m dele. Distância em metros (haversine). */
create function _dist_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8) returns float8 language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create function _session_report(p_session uuid) returns setof participant_summaries
language sql stable security definer set search_path = public as $$
  with pos as (
    select user_id, lat, lng, recorded_at,
      extract(epoch from recorded_at - lag(recorded_at) over (partition by user_id order by recorded_at)) as gap
    from positions where session_id = p_session
  ), agg as (
    select user_id, min(recorded_at) as first_at, max(recorded_at) as last_at, count(*)::int as n, max(gap)::int as max_gap
    from pos group by user_id
  ), fin as (
    select user_id, max(at) as at from participant_events where session_id = p_session and event = 'finished' group by user_id
  ), al as (
    select user_id,
      count(*) filter (where type = 'help')::int as help,
      count(*) filter (where type = 'emergency')::int as emergency,
      count(*) filter (where type = 'signal_lost')::int as lost
    from alerts where session_id = p_session group by user_id
  )
  select p.session_id, p.user_id, pr.display_name, p.status::text,
    agg.first_at, coalesce(fin.at, agg.last_at),
    extract(epoch from coalesce(fin.at, agg.last_at) - agg.first_at)::int,
    p.distance_m, coalesce(agg.n, 0), agg.max_gap,
    coalesce(al.help, 0), coalesce(al.emergency, 0), coalesce(al.lost, 0),
    coalesce((
      select jsonb_agg(jsonb_build_object('name', c.name, 'km', c.km, 'at', x.at,
               'elapsed_s', extract(epoch from x.at - agg.first_at)::int) order by c.km)
      from checkpoints c
      cross join lateral (
        select min(q.recorded_at) as at from pos q
        where q.user_id = p.user_id and _dist_m(q.lat, q.lng, c.lat, c.lng) <= 150
      ) x
      where c.session_id = p_session and x.at is not null
    ), '[]'::jsonb),
    now()
  from participants p
  join profiles pr on pr.id = p.user_id
  left join agg on agg.user_id = p.user_id
  left join fin on fin.user_id = p.user_id
  left join al on al.user_id = p.user_id
  where p.session_id = p_session and p.status in ('tracking', 'finished')
$$;

/**
 * Relatório para quem gerencia a sessão. Encerrada e com resumo gravado: usa o resumo (sobrevive à limpeza
 * de positions). Senão, calcula ao vivo.
 */
create function session_report(p_session uuid) returns setof participant_summaries
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_manage(p_session) then raise exception 'not allowed'; end if;
  if exists (select 1 from participant_summaries where session_id = p_session) then
    return query select * from participant_summaries where session_id = p_session;
  else
    return query select * from _session_report(p_session);
  end if;
end $$;

-- Ao encerrar, grava o resumo (idempotente: refaz se reencerrar).
create function sessions_snapshot() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ended' and old.status is distinct from 'ended' then
    delete from participant_summaries where session_id = new.id;
    insert into participant_summaries select * from _session_report(new.id);
  end if;
  return new;
end $$;
-- Roda depois de sessions_on_end (ordem alfabética dos triggers), já com todos finalizados.
create trigger sessions_snapshot after update on sessions for each row execute function sessions_snapshot();

revoke execute on function _session_report, _dist_m from public, anon, authenticated;

-- Retenção: resumos e auditoria por 2 anos.
create or replace function purge_old_data() returns void language sql security definer set search_path = public as $$
  delete from positions where recorded_at < now() - interval '30 days';
  delete from app_logs where ts < now() - interval '90 days';
  delete from participant_events where at < now() - interval '2 years';
  delete from participant_summaries where snapshot_at < now() - interval '2 years';
$$;

alter table participant_events enable row level security;
alter table participant_summaries enable row level security;
create policy participant_events_read on participant_events for select to authenticated using (user_id = auth.uid() or can_manage(session_id));
create policy participant_summaries_read on participant_summaries for select to authenticated using (user_id = auth.uid() or can_manage(session_id));
revoke insert, update, delete on participant_events, participant_summaries from anon, authenticated;
