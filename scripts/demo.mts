/**
 * Prepara um ambiente de demonstração/teste: admin + evento de teste ao vivo com o percurso de referência.
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/demo.mts
 * Depois: npm run simulate -- --session <id impresso>
 */
import { createClient } from '@supabase/supabase-js';
import { createApi } from '@mb/core';

const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service } = process.env;
if (!url || !anon || !service) throw new Error('Defina SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY');
const email = process.env.DEMO_ADMIN_EMAIL ?? 'admin@missaobarra.test';
const password = process.env.DEMO_ADMIN_PASSWORD ?? 'missao-dada-2026';

const sa = createClient(url, service, { auth: { persistSession: false } });
const created = await sa.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Organização' } });
const adminId = created.data.user?.id ?? (await sa.from('profiles').select('id').eq('display_name', 'Organização').single()).data!.id;
await sa.from('profiles').update({ role: 'admin' }).eq('id', adminId);

const api = createApi(createClient(url, anon, { auth: { persistSession: false } }));
await api.signIn(email, password);
const ev = await api.saveEvent({ name: 'Missão Barra — ensaio de campo', starts_at: new Date().toISOString(), is_test: true });
// Percurso de referência da 5ª edição (journey.ts do kit de marca); largada aproximada.
await api.saveCheckpoints(ev.id, [
  { name: 'Clube da Prancha (Buraquinho)', km: 0, lat: -12.9015, lng: -38.3205, kind: 'start' },
  { name: 'Farol de Itapuã', km: 10, lat: -12.9570655, lng: -38.3536886, kind: 'stop' },
  { name: 'Praia do Corsário', km: 16, lat: -12.9681066, lng: -38.4057227, kind: 'stop' },
  { name: 'Jardim dos Namorados', km: 25, lat: -13.0012074, lng: -38.4495862, kind: 'stop' },
  { name: 'Rio Vermelho', km: 30, lat: -13.0126185, lng: -38.4920669, kind: 'stop' },
  { name: 'Farol da Barra', km: 40, lat: -13.0101987, lng: -38.5329168, kind: 'finish' },
]);
await api.setStatus(ev.id, 'published');
await api.setStatus(ev.id, 'live');
console.log(JSON.stringify({ admin: { email, password }, session: ev.id }));
