/**
 * Simula N participantes num evento de TESTE, sem contas reais, para validar painel, alertas e carga.
 *
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
 *   npx tsx scripts/simulate.mts --session <uuid> [--n 50] [--rounds 30] [--every 5] [--stale 0.1] [--emergency 1]
 *
 * --stale: fração que para de enviar no meio (vira "sinal desatualizado"); --emergency: quantos acionam emergência.
 */
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { createApi, pointAlong, routeLength } from '@mb/core';

const { values: a } = parseArgs({
  options: {
    session: { type: 'string' },
    n: { type: 'string', default: '50' },
    rounds: { type: 'string', default: '30' },
    every: { type: 'string', default: '5' },
    stale: { type: 'string', default: '0.1' },
    emergency: { type: 'string', default: '1' },
  },
});
const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service } = process.env;
if (!a.session || !url || !anon || !service) throw new Error('Informe --session e SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
const n = Number(a.n), rounds = Number(a.rounds), every = Number(a.every) * 1000;
const staleCount = Math.round(n * Number(a.stale)), emergencies = Number(a.emergency);

const admin = createClient(url, service, { auth: { persistSession: false } });
const { data: session, error } = await admin.from('sessions').select('id, name, status, is_test').eq('id', a.session).single();
if (error || !session) throw new Error(`Sessão não encontrada: ${error?.message}`);
if (!session.is_test) throw new Error('Por segurança, só simula em sessões marcadas como teste (is_test).');
if (session.status !== 'live') throw new Error(`A sessão precisa estar "ao vivo" (está "${session.status}").`);

// Caminha pela rota do evento (pontos de apoio em ordem de km) e para na chegada.
const { data: cps } = await admin.from('checkpoints').select('lat, lng, km').eq('session_id', session.id).order('km');
if (!cps || cps.length < 2) throw new Error('Cadastre o percurso (2+ pontos de apoio) antes de simular.');
const route = cps.map((c) => ({ lat: c.lat, lng: c.lng }));
const total = routeLength(route);
const SPEEDUP = Number(process.env.SIM_SPEEDUP ?? 20); // acelera a caminhada (~1,4 m/s) para ver movimento no mapa
const password = 'simulacao-missao-barra-2026';

console.log(`Simulando ${n} participantes em "${session.name}" (${staleCount} perdem sinal, ${emergencies} emergência)…`);
const sims = await Promise.all(Array.from({ length: n }, async (_, i) => {
  const email = `sim-${i}@sim.missaobarra.test`;
  await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `Simulado ${i + 1}` } }).catch(() => undefined);
  const api = createApi(createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } }));
  await api.signIn(email, password);
  // Conta fictícia: cadastro completo marcado direto (service role) para poder iniciar evento oficial.
  await admin.from('profile_contacts').upsert({ user_id: await api.me(), phone: `+55719${String(i).padStart(8, '0')}`, phone_verified_at: new Date().toISOString(), photo_path: 'simulado', registration_number: `SIM-${i + 1}` });
  await api.joinEvent(session.id);
  await api.startTracking(session.id).catch(() => undefined); // já rastreando numa rodada anterior
  return { api, pace: 1.0 + Math.random() * 0.8, walked: Math.random() * 200 };
}));

for (let r = 0; r < rounds; r++) {
  const t0 = Date.now();
  const results = await Promise.allSettled(sims.map(async (s, i) => {
    if (i < staleCount && r > rounds / 2) return; // perderam o sinal
    if (s.walked >= total) return; // chegou
    const step = Math.min((every / 1000) * s.pace * SPEEDUP, total - s.walked);
    s.walked += step;
    const p = pointAlong(route, s.walked);
    await s.api.pushPositions(session.id, [{
      lat: p.lat + (Math.random() - 0.5) / 100_000, // ruído de GPS (~5 m)
      lng: p.lng + (Math.random() - 0.5) / 100_000,
      accuracy: 5 + Math.random() * 10,
      recordedAt: new Date().toISOString(),
    }], step);
    if (r === Math.floor(rounds / 2) && i >= n - emergencies) await s.api.raiseAlert(session.id, 'emergency');
  }));
  const failed = results.filter((x) => x.status === 'rejected').length;
  console.log(`rodada ${r + 1}/${rounds}: ${n - failed} ok, ${failed} falhas, ${Date.now() - t0} ms`);
  await new Promise((ok) => setTimeout(ok, Math.max(0, every - (Date.now() - t0))));
}
// Todos finalizam ao fim (gera avisos de "Finalizou" no painel).
await Promise.allSettled(sims.map((s) => s.api.finish(session.id)));
console.log('Fim. Para limpar: apague a sessão de teste no painel (cascata) e os usuários sim-*@sim.missaobarra.test.');
