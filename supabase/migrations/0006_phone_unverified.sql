-- Por enquanto sem verificação por SMS: a pessoa informa o próprio celular (formato validado).
-- A sincronização via Auth (0004/0005) continua: se um dia houver SMS, phone_verified_at volta a ser preenchido.
grant insert (phone), update (phone) on profile_contacts to authenticated;

alter table profile_contacts add constraint profile_contacts_phone_br check (phone ~ '^\+55[1-9][0-9]9[0-9]{8}$') not valid;

-- Trocar o número invalida uma verificação anterior (exceto quando vem do próprio Auth, sem usuário na sessão).
create function profile_contacts_phone_reset() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and new.phone is distinct from (case when tg_op = 'UPDATE' then old.phone end) then
    new.phone_verified_at := null;
  end if;
  return new;
end $$;
create trigger profile_contacts_phone_reset before insert or update of phone on profile_contacts
  for each row execute function profile_contacts_phone_reset();

-- Cadastro completo para evento oficial: foto + celular informado.
create or replace function profile_complete(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profile_contacts where user_id = p_user and phone is not null and photo_path is not null)
$$;
