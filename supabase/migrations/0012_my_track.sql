-- Compartilhar corrida: cada pessoa lê a PRÓPRIA trilha (positions é restrita à organização).
-- Uma linha jsonb compacta [[lat, lng, precisão, ms epoch], …] evita o limite de linhas do PostgREST.
create function my_track(p_session uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(lat, lng, accuracy, (extract(epoch from recorded_at) * 1000)::bigint) order by recorded_at), '[]'::jsonb)
  from (
    select lat, lng, accuracy, recorded_at from positions
    where session_id = p_session and user_id = auth.uid()
    order by recorded_at limit 50000
  ) t;
$$;
revoke execute on function my_track(uuid) from public, anon;
grant execute on function my_track(uuid) to authenticated;
