-- Dados de contato do participante. Separados de profiles (que é legível por todos para a busca de amigos):
-- só a própria pessoa e a organização (admin) leem ou alteram. LGPD: apagados junto com a conta.
create table profile_contacts (
  user_id uuid primary key references profiles on delete cascade,
  phone text check (char_length(phone) <= 30),
  registration_number text check (char_length(registration_number) <= 40),
  emergency_name text check (char_length(emergency_name) <= 80),
  emergency_phone text check (char_length(emergency_phone) <= 30),
  updated_at timestamptz not null default now()
);

create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger profile_contacts_touch before update on profile_contacts for each row execute function touch_updated_at();

alter table profile_contacts enable row level security;
create policy profile_contacts_read on profile_contacts for select to authenticated using (user_id = auth.uid() or is_admin());
create policy profile_contacts_insert on profile_contacts for insert to authenticated with check (user_id = auth.uid() or is_admin());
create policy profile_contacts_update on profile_contacts for update to authenticated using (user_id = auth.uid() or is_admin());
