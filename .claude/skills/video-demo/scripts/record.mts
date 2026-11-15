/**
 * Grava a tomada do vídeo: palco (stage.html) com o painel no navegador e o app no iPhone.
 * Cada cena marca início/fim; compose.mts encaixa cada cena na fala da narração.
 *
 *   npx tsx .claude/skills/video-demo/scripts/record.mts <dir>            (horizontal 1920×1080 → <dir>/h)
 *   VERTICAL=1 npx tsx …/record.mts <dir>                                   (vertical 1080×1920 → <dir>/v)
 * Requer: <dir>/state.json (setup.mts), <dir>/timeline.json (durações das cenas), painel em :5179, app web em :8099,
 *   e <dir> servido em http://localhost:8098 (python3 -m http.server 8098 -d <dir>) — mesmo site dos iframes.
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD.
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Frame, type FrameLocator, type Locator, type Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { createApi, pointAlong, routeLength, type Point } from '@mb/core';

const dir = process.argv[2];
const here = dirname(fileURLToPath(import.meta.url));
const env = process.env as Record<string, string>;
const state = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'));
const timeline: { id: string; d: number }[] = JSON.parse(readFileSync(join(dir, 'timeline.json'), 'utf8'));
const D = Object.fromEntries(timeline.map((s) => [s.id, s.d]));
const ADMIN = 'http://127.0.0.1:5179/';
const APP = 'http://localhost:8099/';
const EVENT_NAME = 'Missão Barra — 6ª edição';
const sa = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const path: Point[] = state.route.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));
const L = routeLength(path);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const V = env.VERTICAL === '1';
const W = V ? 1080 : 1920, H = V ? 1920 : 1080;
const OUT = join(dir, V ? 'v' : 'h');

copyFileSync(join(here, 'stage.html'), join(dir, 'stage.html'));
rmSync(join(OUT, 'frames'), { recursive: true, force: true });
mkdirSync(join(OUT, 'frames'), { recursive: true });

// ---------- navegador ----------
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, permissions: ['geolocation'],
  geolocation: { latitude: -13.0103, longitude: -38.5326, accuracy: 5 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 160)));
await page.goto(`http://localhost:${env.STAGE_PORT ?? 8098}/stage.html${V ? '?v=1' : ''}`);
await page.evaluate(([a, b]) => (window as never as { stage: { load: (a: string, b: string) => void } }).stage.load(a, b), [ADMIN, APP]);
const st = (fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as never as Record<string, Record<string, (...x: unknown[]) => unknown>>).stage[f as string](...(a as unknown[])), [fn, args] as const);
const admin: FrameLocator = page.frameLocator('#admin');
const app: FrameLocator = page.frameLocator('#app');
const frameOf = (port: string): Frame => page.frames().find((f) => f.url().includes(port))!;

/** Cursor até o elemento e clique (navegador). */
async function click(loc: Locator, opts: { ms?: number } = {}) {
  await loc.waitFor({ state: 'visible', timeout: 15000 });
  const b = (await loc.boundingBox())!;
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await st('cursor', x, y, opts.ms ?? 650);
  await sleep((opts.ms ?? 650) + 60);
  await st('click', x, y);
  await loc.click();
}
/** Toque no celular (círculo branco, sem cursor). */
async function tap(loc: Locator) {
  await loc.waitFor({ state: 'visible', timeout: 15000 });
  const b = (await loc.boundingBox())!;
  await st('cursor', b.x + b.width / 2, b.y + b.height / 2, 300, false);
  await st('tap', b.x + b.width / 2, b.y + b.height / 2);
  await sleep(120);
  await loc.click();
}
async function ring(loc: Locator, id = 'ring') {
  const b = await loc.boundingBox({ timeout: 4000 }).catch(() => null);
  if (b) await st('ring', b.x, b.y, b.width, b.height, id);
}
async function center(loc: Locator) { const b = (await loc.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
/** Foco num aparelho. Na vertical a câmera também aproxima o celular (o navegador já ocupa a largura). */
async function focus(which: 'phone' | 'browser') {
  await st('focus', which);
  if (!V) return;
  // Centro do celular sem zoom (stage.html, layout vertical: #pw em 349,1000 com escala .9 → 381,6×792).
  if (which === 'phone') await st('camera', 1.3, 540, 1396, 900, W / 2, H / 2 + 120);
  else await st('camera', 1, undefined, undefined, 900);
  await sleep(950); // espera a câmera parar antes de tocar/clicar
}

// ---------- login (fora da gravação) ----------
await admin.getByPlaceholder('E-mail').fill(env.DEMO_ADMIN_EMAIL, { timeout: 60000 });
await admin.getByPlaceholder('Senha').fill(env.DEMO_ADMIN_PASSWORD);
await admin.getByRole('button', { name: 'Entrar →' }).click();
await admin.getByPlaceholder(/Nome \(ex\.:/).waitFor({ timeout: 30000 });
// Cosmético da gravação: esconde a caixa "Sessão de teste" (o evento é de teste e será apagado).
await frameOf('5179').addStyleTag({ content: 'form.card label.row{display:none!important} .badge.not_started{display:none!important}' });
// Lista limpa na gravação: esconde (sem apagar) eventos antigos de teste/arquivados.
await admin.locator('tbody tr').first().waitFor({ timeout: 15000 }).catch(() => undefined);
await frameOf('5179').evaluate(() => document.querySelectorAll('tbody tr').forEach((tr) => {
  const t = tr.textContent ?? '';
  if (/Evento UI|Prévia|Arquivado|Rascunho|Encerrado/.test(t)) (tr as HTMLElement).style.display = 'none';
}));
await app.getByPlaceholder('E-mail').waitFor({ timeout: 120000 });
await st('status', true);

// ---------- screencast ----------
const cdp = await ctx.newCDPSession(page);
const frames: { file: string; t: number }[] = [];
cdp.on('Page.screencastFrame', (f) => {
  void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined); // libera o próximo quadro já
  const file = `f${String(frames.length).padStart(6, '0')}.jpg`;
  frames.push({ file, t: f.metadata.timestamp ?? Date.now() / 1000 });
  void writeFile(join(OUT, 'frames', file), Buffer.from(f.data, 'base64'));
});
const marks: { id: string; start: number; end: number; d: number }[] = [];
async function scene(id: string, fn: () => Promise<void>) {
  const start = Date.now() / 1000;
  console.log('cena', id);
  try { await fn(); } catch (e) {
    console.log('  falhou:', String(e).split('\n')[0]);
    await page.screenshot({ path: join(OUT, `falha-${id}.png`) }).catch(() => undefined);
  }
  const min = D[id] * 1000 - (Date.now() / 1000 - start) * 1000;
  if (min > 0) await sleep(min);
  marks.push({ id, start, end: Date.now() / 1000, d: D[id] });
}
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
// Mantém o compositor produzindo quadros mesmo com a tela parada.
await page.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:.01;animation:spin 1s linear infinite'; document.body.append(d); });
await sleep(800);

// ---------- 1 · abertura ----------
await scene('intro', async () => {
  await st('card', 'intro', true);
  await sleep(D.intro * 1000 - 700);
  await st('card', 'intro', false);
});

// ---------- 2 · criar evento ----------
let eventId = '';
await scene('create', async () => {
  await focus('browser');
  await st('caption', 'Organização · navegador', 'Crie o evento em minutos');
  const name = admin.getByPlaceholder(/Nome \(ex\.:/);
  await click(name, { ms: 500 });
  await name.pressSequentially(EVENT_NAME, { delay: 22 });
  await click(admin.getByRole('button', { name: 'Criar →' }), { ms: 450 });
  await page.waitForFunction(() => true);
  for (let i = 0; i < 40 && !/evento\/[0-9a-f-]{36}/.test(frameOf('5179').url()); i++) await sleep(100);
  eventId = frameOf('5179').url().match(/evento\/([0-9a-f-]{36})/)![1];
  // Percurso pelas ruas (pontos de apoio reais da orla), como se tivesse sido desenhado no editor.
  await sa.from('checkpoints').insert(state.checkpoints.map((c: object) => ({ ...c, session_id: eventId })));
  await sa.from('sessions').update({ route: state.route, starts_at: new Date().toISOString() }).eq('id', eventId);
  await frameOf('5179').evaluate((u) => { location.href = u; location.reload(); }, `${ADMIN}#/evento/${eventId}/percurso`);
  await sleep(300);
  await admin.locator('.leaflet-container').first().waitFor({ timeout: 15000 });
  await admin.locator('path.leaflet-interactive').first().waitFor({ timeout: 10000 }).catch(() => undefined);
  await sleep(700);
  await click(admin.getByRole('button', { name: /^Publicar/ }), { ms: 500 });
  await sleep(450);
  await click(admin.getByRole('button', { name: /^Iniciar/ }), { ms: 450 });
  await sleep(700);
});
console.log('evento', eventId);

// ---------- bastidores: caminhantes fictícios entram no evento ----------
type Walker = { api: ReturnType<typeof createApi>; m: number; stale: boolean; id: string };
const walkers: Walker[] = [];
const FRACS = [0, 0.43, 0.17, 0.39, 0.35, 0.31, 0.28, 0.255, 0.23, 0.205, 0.18, 0.15, 0.115, 0.09, 0.06, 0.035];
const fix = (p: Point, t: number) => ({ lat: p.lat, lng: p.lng, accuracy: 6, recordedAt: new Date(t).toISOString() });
async function joinWalker(i: number) {
  const p = state.people[i];
  const api = createApi(createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }));
  await api.signIn(p.email, state.password);
  await api.joinEvent(eventId);
  await api.startTracking(eventId);
  const target = FRACS[i] * L, stale = i === 2;
  const endT = Date.now() - (stale ? 6 * 60e3 : 5e3), startT = endT - (target / 1.7) * 1000; // ~1,7 m/s (caminhada forte)
  const fixes = [];
  for (let m = 0; m <= target; m += 140) fixes.push(fix(pointAlong(path, m), startT + (m / target) * (endT - startT)));
  fixes.push(fix(pointAlong(path, target), endT));
  for (let k = 0; k < fixes.length; k += 120) await api.pushPositions(eventId, fixes.slice(k, k + 120), k === 0 ? target : 0, 40 + ((i * 13) % 55));
  walkers.push({ api, m: target, stale, id: p.id });
}
const joined = Promise.all(state.people.slice(1).map((_: unknown, k: number) => joinWalker(k + 1))).catch((e) => console.log('walkers', e));
let walking = true;
const walkLoop = (async () => {
  await joined;
  while (walking) {
    await Promise.all(walkers.filter((w) => !w.stale).map((w, k) => {
      w.m += 22 + (k % 4) * 4; // acelerado para o movimento aparecer no mapa
      return w.api.pushPositions(eventId, [fix(pointAlong(path, w.m), Date.now())], 22).catch(() => undefined);
    }));
    await sleep(1500);
  }
})();

// Juliana (protagonista): começa no km ~5,2 e anda pelo percurso no celular (geolocalização do navegador).
const jul = state.people[0];
let julM = 0.13 * L;
let julWalking = false;
const julLoop = (async () => {
  while (walking) {
    if (julWalking) julM += 2.2;
    const p = pointAlong(path, julM);
    await ctx.setGeolocation({ latitude: p.lat, longitude: p.lng, accuracy: 5 });
    await sleep(330);
  }
})();

// Celular: login e tela do evento (fora da gravação).
await app.getByPlaceholder('E-mail').fill(jul.email);
await app.getByPlaceholder('Senha').fill(state.password);
await app.getByRole('button', { name: 'Entrar' }).click();
await sleep(2500);
await frameOf('8099').goto(`${APP}session/${eventId}`);
await app.getByText('Entendi, quero compartilhar').waitFor({ timeout: 30000 });
await st('status', false);

// ---------- 3 · participante inicia ----------
await scene('join', async () => {
  await focus('phone');
  await st('caption', 'Participante · celular', 'Entrar é um toque');
  await sleep(500);
  await tap(app.getByText('Entendi, quero compartilhar'));
  await sleep(700);
  await tap(app.getByText('Iniciar percurso'));
  await sleep(1200);
});

// Bastidores: 55 min de caminhada já feitos (para tempo/pace realistas) e posição no servidor.
{
  const japi = createApi(createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }));
  await japi.signIn(jul.email, state.password);
  const startT = Date.now() - 55 * 60e3, fixes = [];
  for (let m = 0; m <= julM; m += 140) fixes.push(fix(pointAlong(path, m), startT + (m / julM) * (55 * 60e3 - 3000)));
  for (let k = 0; k < fixes.length; k += 120) await japi.pushPositions(eventId, fixes.slice(k, k + 120), 0).catch((e) => console.log('jul push', e.message));
  await sa.from('participant_events').update({ at: new Date(startT).toISOString() }).eq('session_id', eventId).eq('user_id', jul.id).eq('event', 'tracking');
  await sa.from('participants').update({ distance_m: Math.round(julM) }).eq('session_id', eventId).eq('user_id', jul.id);
  await joined;
  await frameOf('8099').evaluate(() => location.reload());
  await sleep(500);
  await app.getByText('Mais dados').waitFor({ timeout: 30000 });
  julWalking = true;
  await sleep(2500);
}

// ---------- 4 · modo corrida ----------
await scene('runner', async () => {
  await st('caption', 'Modo corrida', 'O caminho sempre à frente');
  if (V) await focus('phone');
  else {
    await st('focus', 'phone');
    const ph = await center(page.locator('#phone'));
    await st('camera', 1.15, ph.x - 300, ph.y); // aproxima sem cobrir a legenda
  }
  await sleep(1300);
  await ring(app.getByText('Próximo ponto').locator('xpath=ancestor::div[2]'));
  await sleep(1700);
  await st('unring');
  await tap(app.getByText('Mais dados'));
  await sleep(300);
  await ring(app.getByText('Menos dados').locator('xpath=ancestor::div[2]'));
  await sleep(1400);
  await st('unring');
});
await st('camera', 1);
await tap(app.getByText('Menos dados')).catch(() => undefined);

// Painel no monitoramento (fora da gravação).
await frameOf('5179').goto(`${ADMIN}#/evento/${eventId}/monitor`);
await admin.locator('.leaflet-container').first().waitFor({ timeout: 20000 }).catch(() => undefined);
await sleep(2500);

// ---------- 5 · acompanhamento ao vivo ----------
await scene('live', async () => {
  await focus('browser');
  await sleep(V ? 400 : 0);
  await st('caption', 'Acompanhamento ao vivo', 'Todo mundo no mapa');
  const map = await center(admin.locator('.leaflet-container').first());
  await st('camera', 1.25, map.x, map.y);
  await sleep(2300);
  await st('camera', 1);
  await sleep(700);
  // Indicadores (sem clicar: o clique abre a lista; aqui o foco é o mapa).
  const kpis = admin.locator('.kpis').first();
  await ring(kpis);
  const k = await center(kpis).catch(() => null);
  if (k) await st('cursor', k.x, k.y, 600);
  await sleep(1400);
  await st('unring');
});

// Relatório (fora da gravação).
await frameOf('5179').goto(`${ADMIN}#/evento/${eventId}/relatorio`);
await admin.getByText('Avanço por ponto de apoio').waitFor({ timeout: 20000 });
await sleep(1500);

// ---------- 6 · avanço por ponto de apoio ----------
await scene('funnel', async () => {
  await st('caption', 'Pontos de apoio', 'Quem passou e quem falta');
  const card = admin.getByText('Avanço por ponto de apoio').locator('xpath=ancestor::*[contains(@class,"card")][1]');
  const c = await center(card);
  // Vertical: navegador ocupa a largura; zoom menor e enquadramento abaixo do título.
  if (V) await st('camera', 1.1, c.x, c.y, 1100, W / 2, H / 2 + 60);
  else await st('camera', 1.3, c.x - 60, c.y - 40);
  await sleep(1300);
  const row = admin.locator('button.funnel', { hasText: 'Rio Vermelho' });
  await click(row, { ms: 600 });
  await sleep(900);
  const detail = admin.locator('.funnel-detail').first();
  const dc = await center(detail).catch(() => c);
  if (V) await st('camera', 1.2, dc.x, dc.y, 1100, W / 2, H / 2 + 80);
  else await st('camera', 1.38, dc.x - 40, dc.y);
  await sleep(1500);
});
await st('camera', 1);

// ---------- 7 · pedido de ajuda ----------
await scene('help', async () => {
  await focus('phone');
  await st('caption', 'Ajuda', 'Conversa direta com a equipe');
  await tap(app.getByRole('button', { name: 'Ajuda' }));
  await app.getByText('Câimbra', { exact: true }).waitFor({ timeout: 15000 });
  await sleep(500);
  await tap(app.getByText('Câimbra', { exact: true }));
  await sleep(1100);
  await focus('browser');
  await sleep(V ? 500 : 0);
  await ring(admin.getByRole('button', { name: 'Abrir alertas' }));
  await sleep(900);
  await st('unring');
  await click(admin.locator('nav.tabs').getByText(/^Atendimentos/), { ms: 500 });
  await sleep(500);
  await click(admin.locator('.inbox-item', { hasText: jul.name }).first(), { ms: 450 });
  await sleep(700);
});

// ---------- 8 · resposta + emergência ----------
await scene('reply', async () => {
  await click(admin.getByRole('button', { name: 'Equipe a caminho' }), { ms: 500 });
  await focus('phone');
  await st('caption', 'Resposta na hora', 'Emergência: é só segurar');
  await app.getByText('Equipe a caminho').last().waitFor({ timeout: 8000 }).catch(() => undefined);
  await sleep(1300);
  // Volta pela seta do cabeçalho do app (sem recarregar: a tela do mapa continua montada, sem tela branca).
  // history.back() não serve: o histórico é compartilhado entre os iframes e voltaria o painel.
  const title = await app.getByText('Ajuda da organização').first().boundingBox();
  if (title) {
    const x = title.x - 26 * (V ? 1.17 : 0.85), y = title.y + title.height / 2;
    await st('tap', x, y);
    await page.mouse.click(x, y);
  }
  const sos = app.getByRole('button', { name: 'Emergência' });
  await sos.waitFor({ timeout: 15000 });
  await ring(sos, 'sos');
  const b = (await sos.boundingBox())!;
  await st('tap', b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await sleep(750); // segura sem completar 1 s: mostra a barra enchendo, sem disparar
  await page.mouse.up();
  await sleep(500);
  await st('unring', 'sos');
});

// Fora da gravação: reabre a conversa no painel (o "voltar" do app mexe no histórico compartilhado dos iframes).
await frameOf('5179').goto(`${ADMIN}#/evento/${eventId}/atendimentos/${jul.id}`).catch(() => undefined);
await admin.getByText('Ver perfil e contato').waitFor({ timeout: 10000 }).catch(() => undefined);
await sleep(600);

// ---------- 9 · perfil ----------
await scene('profile', async () => {
  await focus('browser');
  await st('caption', 'Perfil', 'Foto e contato de emergência');
  await click(admin.getByText('Ver perfil e contato'), { ms: 500 });
  const modal = admin.locator('.modal, [role="dialog"]').first();
  await modal.waitFor({ timeout: 10000 });
  await sleep(500);
  const m = await center(modal);
  if (V) await st('camera', 1.15, m.x, m.y, 1100, W / 2, H / 2 + 60);
  else await st('camera', 1.22, m.x, m.y + 60);
  await sleep(1900);
});
await st('camera', 1);

// ---------- 10 · fechamento ----------
await scene('outro', async () => {
  await focus('phone');
  await st('caption', 'Visão do percurso', '40 km, ponto a ponto');
  await tap(app.getByRole('button', { name: 'Percurso' }));
  await sleep(1300);
  await st('caption', '', '');
  await st('card', 'outro', true);
  await sleep(D.outro * 1000 - 1600);
});

await sleep(600);
await cdp.send('Page.stopScreencast');
walking = false;
await Promise.allSettled([walkLoop, julLoop]);
writeFileSync(join(OUT, 'take.json'), JSON.stringify({ eventId, frames, marks }, null, 1));
console.log(`quadros: ${frames.length} (${(frames.length / (frames.at(-1)!.t - frames[0].t)).toFixed(1)} fps)`);
await browser.close();
