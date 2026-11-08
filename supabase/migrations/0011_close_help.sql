-- Encerrar atendimento (ajuda/emergência): o próprio participante ou a organização.
-- Resolve os alertas abertos dessa pessoa no evento e registra na conversa quem encerrou.
create function close_help(p_session uuid, p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not (auth.uid() = p_user or can_manage(p_session)) then raise exception 'not allowed'; end if;
  update alerts set resolved_at = now()   -- trigger grava resolved_by = auth.uid()
  where session_id = p_session and user_id = p_user and type in ('help', 'emergency') and resolved_at is null;
  get diagnostics n = row_count;
  if n > 0 and session_kind_of(p_session) = 'official' then
    insert into help_messages (session_id, user_id, sender_id, body)
    values (p_session, p_user, auth.uid(), case when auth.uid() = p_user then 'Atendimento encerrado pelo participante.' else 'Atendimento encerrado pela organização.' end);
  end if;
  return n;
end $$;
revoke execute on function close_help(uuid, uuid) from anon, public;
grant execute on function close_help(uuid, uuid) to authenticated;
