-- Cadastro seguro e requisitos de acompanhamento: telefone verificado por SMS, foto, saúde, bateria e equipe.

-- ---------- contato: telefone só via verificação ----------
alter table profile_contacts
  add column phone_verified_at timestamptz,
  add column photo_path text check (char_length(photo_path) <= 200),
  add column health_notes text check (char_length(health_notes) <= 500); -- dado sensível (LGPD): opcional, só organização

-- O telefone vem do Supabase Auth depois que o código SMS é confirmado; o usuário não o grava direto.
revoke insert, update on profile_contacts from authenticated;
grant insert (user_id, registration_number, emergency_name, emergency_phone, photo_path, health_notes),
      update (registration_number, emergency_name, emergency_phone, photo_path, health_notes) on profile_contacts to authenticated;

create function sync_verified_phone() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.phone_confirmed_at is not null and new.phone is not null
     and (old.phone_confirmed_at is distinct from new.phone_confirmed_at or old.phone is distinct from new.phone) then
    insert into profile_contacts (user_id, phone, phone_verified_at) values (new.id, '+' || ltrim(new.phone, '+'), new.phone_confirmed_at)
    on conflict (user_id) do update set phone = excluded.phone, phone_verified_at = excluded.phone_verified_at;
  end if;
  return new;
end $$;
create trigger on_auth_phone_verified after update of phone, phone_confirmed_at on auth.users for each row execute function sync_verified_phone();

-- Cadastro completo para iniciar evento oficial: foto + telefone verificado.
create function profile_complete(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profile_contacts where user_id = p_user and phone_verified_at is not null and photo_path is not null)
$$;

-- ---------- bateria ----------
alter table participants add column battery smallint check (battery between 0 and 100);
grant select (battery) on participants to authenticated;

drop function push_positions(uuid, jsonb, double precision);
create function push_positions(p_session uuid, p_fixes jsonb, p_distance_m double precision, p_battery smallint default null)
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
    last_at = (last_fix->>'recordedAt')::timestamptz, distance_m = distance_m + greatest(p_distance_m, 0),
    battery = coalesce(p_battery, battery)
  where session_id = p_session and user_id = auth.uid();
  perform set_config('mb.push', 'off', true);
end $$;

-- Bateria também é campo do servidor (não editável direto pelo cliente).
create or replace function participants_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  select * into s from sessions where id = new.session_id;
  if auth.uid() is not null and auth.uid() <> new.user_id and new.status in ('accepted', 'declined', 'tracking')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if not (tg_op = 'INSERT' and new.status = 'accepted' and new.user_id = s.owner_id) then
      raise exception 'only the participant can change to %', new.status;
    end if;
  end if;
  if new.status = 'tracking' and s.status <> 'live' then
    raise exception 'session is not live';
  end if;
  if new.status = 'tracking' and (tg_op = 'INSERT' or old.status not in ('accepted', 'tracking')) then
    raise exception 'must accept before tracking';
  end if;
  -- Evento oficial exige cadastro completo (foto + celular verificado) para iniciar.
  if new.status = 'tracking' and s.kind = 'official' and (tg_op = 'INSERT' or old.status <> 'tracking')
     and not profile_complete(new.user_id) then
    raise exception 'profile incomplete';
  end if;
  if new.status in ('finished', 'declined', 'invited') then
    new.sharing := false;
  end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and current_setting('mb.push', true) is distinct from 'on'
     and (new.last_lat, new.last_lng, new.last_at, new.distance_m, new.battery)
         is distinct from (old.last_lat, old.last_lng, old.last_at, old.distance_m, old.battery) then
    raise exception 'position fields are server-managed';
  end if;
  return new;
end $$;

-- Mapa ao vivo com bateria.
create or replace view live_participants as
select p.session_id, p.user_id, pr.display_name, p.status, p.sharing, p.distance_m, p.last_at,
  case when show then p.last_lat end as last_lat,
  case when show then p.last_lng end as last_lng,
  p.battery
from participants p
join profiles pr on pr.id = p.user_id
join sessions s on s.id = p.session_id
cross join lateral (select
  p.user_id = auth.uid()
  or (p.status = 'tracking' and p.sharing)
  or (s.kind = 'official' and is_admin()) as show) v
where p.user_id = auth.uid() or is_participant(p.session_id) or can_manage(p.session_id);

-- ---------- equipe ----------
/** Lista a equipe (admins) com e-mail; só para admins. */
create function list_staff() returns table (id uuid, display_name text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, u.email::text from profiles p join auth.users u on u.id = p.id
  where p.role = 'admin' and is_admin() order by p.display_name
$$;

/** Promove/remove organizador pelo e-mail. Ninguém remove a si mesmo (evita ficar sem admin). */
create function set_staff(p_email text, p_admin boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'user not found'; end if;
  if uid = auth.uid() and not p_admin then raise exception 'cannot remove yourself'; end if;
  update profiles set role = case when p_admin then 'admin' else 'user' end where id = uid;
  return uid;
end $$;

-- ---------- foto (Storage privado) ----------
-- Caminho: avatars/<user_id>/<arquivo>. Só a pessoa grava; só ela e a organização leem (URL assinada).
do $$ begin
  -- Só onde o serviço de Storage está instalado (nuvem/CLI); a stack mínima de testes não tem.
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    execute $p$create policy avatars_write on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy avatars_update on storage.objects for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy avatars_read on storage.objects for select to authenticated
      using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))$p$;
  end if;
end $$;
