/**
 * Prepara os dados do vídeo (só contas *@teste.dev e evento de teste):
 *  - percurso pela orla de Salvador (Farol da Barra → Buraquinho) desenhado pelas ruas;
 *  - elenco fictício com foto (rostos gerados por IA em <dir>/cast/NN.jpg) e cadastro completo.
 * Uso: npx tsx .claude/skills/video-demo/scripts/setup.mts <dir>   (env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
 * Saída: <dir>/state.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { haversine, lineToPoints, snapRoute } from '@mb/core';

const dir = process.argv[2];
const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service } = process.env as Record<string, string>;
if (!dir || !url || !service) throw new Error('uso: setup.mts <dir> com SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY');
const sa = createClient(url, service, { auth: { persistSession: false } });
const PASSWORD = 'video-demo-2026';

// Pontos de apoio reais da orla (nomes de bairros), na ordem do percurso.
const STOPS: [string, number, number][] = [
  ['Farol da Barra', -13.0103, -38.5326], ['Ondina', -13.0094, -38.5122], ['Rio Vermelho', -13.0121, -38.4902],
  ['Amaralina', -13.0093, -38.4702], ['Pituba', -13.0010, -38.4565], ['Jardim de Alah', -12.9958, -38.4445],
  ['Boca do Rio', -12.9805, -38.4255], ['Piatã', -12.9562, -38.3905], ['Farol de Itapuã', -12.9571, -38.3532],
  ['Stella Maris', -12.9402, -38.3332], ['Praia do Flamengo', -12.9152, -38.3152], ['Vilas do Atlântico', -12.8852, -38.2962],
  ['Buraquinho', -12.8702, -38.2832],
];

export const CAST = [
  'Juliana Ramos', 'Henrique Teixeira', 'Carla Menezes', 'Bruno Almeida', 'Ana Paula Souza', 'Marcos Oliveira', 'Larissa Santos',
  'Thiago Nunes', 'Patrícia Lima', 'Diego Barbosa', 'Fernanda Rocha', 'Lucas Pereira', 'Renata Carvalho', 'Gustavo Moreira',
  'Camila Freitas', 'Paulo Ribeiro',
];

const route = await snapRoute(STOPS.map(([, lat, lng]) => ({ lat, lng })));
const path = lineToPoints(route)!;
const cum = [0];
for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversine(path[i - 1], path[i]));
let from = 0;
const checkpoints = STOPS.map(([name, lat, lng], i) => {
  // km oficial = distância pelo caminho até o vértice mais próximo (sempre à frente do anterior).
  let best = from, bd = Infinity;
  for (let j = from; j < path.length; j++) { const d = haversine(path[j], { lat, lng }); if (d < bd) { bd = d; best = j; } }
  from = best;
  return { name, lat, lng, km: +(cum[best] / 1000).toFixed(1), kind: i === 0 ? 'start' : i === STOPS.length - 1 ? 'finish' : 'stop' };
});
console.log(`percurso: ${(cum.at(-1)! / 1000).toFixed(1)} km, ${path.length} vértices, ${checkpoints.length} pontos`);

const slug = (s: string) => s.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase();
// Idempotente: reaproveita contas e fotos de uma gravação anterior (mesmos rostos ao regravar).
const existing = new Map((await sa.auth.admin.listUsers({ perPage: 1000 })).data.users.map((u) => [u.email, u.id]));
mkdirSync(`${dir}/cast`, { recursive: true });
const people = [];
for (const [i, name] of CAST.entries()) {
  const email = `video-${slug(name)}@teste.dev`;
  let id = existing.get(email);
  if (!id) {
    const { data, error } = await sa.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: name } });
    if (error) throw error;
    id = data.user.id;
  } else await sa.auth.admin.updateUserById(id, { password: PASSWORD });
  await sa.from('profiles').update({ display_name: name }).eq('id', id);
  const photo = `${id}/foto-video.jpg`;
  const face = `${dir}/cast/${String(i).padStart(2, '0')}.jpg`;
  if (existsSync(face)) {
    const up = await sa.storage.from('avatars').upload(photo, readFileSync(face), { contentType: 'image/jpeg', upsert: true });
    if (up.error) throw up.error;
  } else {
    // Sem a foto local: baixa a que já está no Storage (guarda em cast/ para a próxima vez).
    const dl = await sa.storage.from('avatars').download(photo);
    if (dl.error) throw new Error(`sem foto para ${name}: coloque ${face}`);
    writeFileSync(face, Buffer.from(await dl.data.arrayBuffer()));
  }
  // Telefones de teste (9 0000 00xx), contato de emergência fictício.
  const c = await sa.from('profile_contacts').upsert({
    user_id: id, photo_path: photo, phone: `+55719000000${String(10 + i)}`, phone_verified_at: new Date().toISOString(),
    registration_number: `MB-${String(1040 + i * 7)}`, emergency_name: i === 0 ? 'Marcos Ramos (irmão)' : 'Contato da família',
    emergency_phone: `+55719000001${String(10 + i)}`, health_notes: i === 0 ? 'Asma leve — usa bombinha' : null,
  });
  if (c.error) throw c.error;
  people.push({ id, email, name });
}
writeFileSync(`${dir}/state.json`, JSON.stringify({ password: PASSWORD, checkpoints, route, people }, null, 1));
console.log(`elenco: ${people.length} contas`);
void anon;
