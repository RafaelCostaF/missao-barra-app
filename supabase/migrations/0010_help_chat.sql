-- Ajuda por conversa: participante ↔ organização (só eventos oficiais). Não é chat entre participantes.
-- A primeira mensagem sem pedido de ajuda aberto cria o alerta "help" (com a posição) para a organização ver.

create table help_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references sessions on delete cascade,
  user_id uuid not null references profiles on delete cascade,   -- participante dono da conversa
  sender_id uuid references profiles on delete set null,         -- quem escreveu (ele ou um organizador)
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index on help_messages (session_id, user_id, created_at);
alter table help_messages enable row level security;
create policy help_messages_read on help_messages for select to authenticated using (
  user_id = auth.uid() or (session_kind_of(session_id) = 'official' and is_admin())
);
revoke insert, update, delete on help_messages from anon, authenticated;

/** Envia mensagem na conversa de ajuda de `p_user`. Participante escreve na própria; organização responde. */
create function send_help_message(p_session uuid, p_user uuid, p_body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare mid bigint;
begin
  if session_kind_of(p_session) is distinct from 'official' then raise exception 'help chat only in official events'; end if;
  if auth.uid() = p_user then
    if not exists (select 1 from participants where session_id = p_session and user_id = p_user and status in ('accepted', 'tracking', 'finished')) then
      raise exception 'not a participant';
    end if;
    -- Sem pedido aberto: abre um (organização recebe o alerta com a última posição).
    if not exists (select 1 from alerts where session_id = p_session and user_id = p_user and type in ('help', 'emergency') and resolved_at is null) then
      insert into alerts (session_id, user_id, type, lat, lng)
      select p_session, p_user, 'help', last_lat, last_lng from participants where session_id = p_session and user_id = p_user;
    end if;
  elsif not is_admin() then
    raise exception 'not allowed';
  end if;
  insert into help_messages (session_id, user_id, sender_id, body) values (p_session, p_user, auth.uid(), btrim(p_body)) returning id into mid;
  return mid;
end $$;
revoke execute on function send_help_message(uuid, uuid, text) from anon, public;
grant execute on function send_help_message(uuid, uuid, text) to authenticated;

alter publication supabase_realtime add table help_messages;
