-- Evento de TESTE com o percurso de referência da 5ª edição (coordenadas aproximadas).
-- Requer um admin: após criar a conta, rode `update profiles set role = 'admin' where id = '<uuid>';`
do $$
declare admin uuid := (select id from profiles where role = 'admin' limit 1);
declare sid uuid;
begin
  if admin is null then raise notice 'seed: nenhum admin, pulando'; return; end if;
  insert into sessions (kind, name, status, owner_id, starts_at, is_test)
  values ('official', 'Missão Barra — ensaio (teste)', 'published', admin, now() + interval '1 day', true)
  returning id into sid;
  insert into checkpoints (session_id, name, km, lat, lng, kind) values
    (sid, 'Clube da Prancha (Buraquinho)', 0,  -12.9015, -38.3205, 'start'),
    (sid, 'Farol de Itapuã',               10, -12.9570655, -38.3536886, 'stop'),
    (sid, 'Praia do Corsário',             16, -12.9681066, -38.4057227, 'stop'),
    (sid, 'Jardim dos Namorados',          25, -13.0012074, -38.4495862, 'stop'),
    (sid, 'Rio Vermelho',                  30, -13.0126185, -38.4920669, 'stop'),
    (sid, 'Farol da Barra',                40, -13.0101987, -38.5329168, 'finish');
end $$;
