-- Defesa em profundidade: no Supabase hospedado a troca de celular pode ser autoconfirmada (sem código) dependendo
-- da configuração do provedor de telefone. Só conta como verificado se um código SMS foi de fato enviado.
create or replace function sync_verified_phone() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.phone_confirmed_at is not null and new.phone is not null and new.phone_change_sent_at is not null
     and (old.phone_confirmed_at is distinct from new.phone_confirmed_at or old.phone is distinct from new.phone) then
    insert into profile_contacts (user_id, phone, phone_verified_at) values (new.id, '+' || ltrim(new.phone, '+'), new.phone_confirmed_at)
    on conflict (user_id) do update set phone = excluded.phone, phone_verified_at = excluded.phone_verified_at;
  end if;
  return new;
end $$;
