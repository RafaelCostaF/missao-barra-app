/**
 * Monta o vídeo a partir da tomada (<dir>/<h|v>/take.json + frames/):
 *  1. cada cena: quadros do screencast (~15–25 fps, ritmo variável) → interpolação com compensação de movimento
 *     para 30 fps (minterpolate mci, cenas em paralelo) → acelera se a ação passou do tempo da fala → corta na fala;
 *  2. legenda da narração (<dir>/subtitles.json: [[início_s, "texto"], …]) e barra de progresso por cena,
 *     desenhadas como camadas sobre o vídeo — batem com a fala mesmo quando uma cena foi acelerada;
 *  3. narração + fades → mestre H.264 de alta qualidade;
 *  4. versões para artifact (limite de 15 MB por arquivo): AV1 (nítido em telas com texto) e H.264 de reserva;
 *  5. 1 quadro por cena em review/ para conferir.
 *
 *   [VERTICAL=1] npx tsx .claude/skills/video-demo/scripts/compose.mts <dir> <narracao.mp3> <pasta_saida>
 * Saídas: missao-barra-demo[-vertical].mp4 (mestre), …-web-av1.mp4 e …-web-h264.mp4 (artifact).
 */
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const run = promisify(execFile);
const [dir, audio, outDir] = process.argv.slice(2);
if (!dir || !audio || !outDir) throw new Error('uso: compose.mts <dir> <narracao.mp3> <pasta_saida>');
const V = process.env.VERTICAL === '1';
const W = V ? 1080 : 1920, H = V ? 1920 : 1080;
const work = join(dir, V ? 'v' : 'h');
const name = V ? 'missao-barra-demo-vertical' : 'missao-barra-demo';
const take = JSON.parse(readFileSync(join(work, 'take.json'), 'utf8')) as {
  frames: { file: string; t: number }[]; marks: { id: string; start: number; end: number; d: number }[];
};
const subs = JSON.parse(readFileSync(join(dir, 'subtitles.json'), 'utf8')) as [number, string][];
const ff = (args: string[]) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 1 << 26 });
const total = take.marks.reduce((s, m) => s + m.d, 0);
mkdirSync(join(work, 'seg'), { recursive: true });
mkdirSync(join(work, 'ov'), { recursive: true });
mkdirSync(outDir, { recursive: true });

// ---------- 1. cenas ----------
const interp = process.env.INTERP !== '0';
await Promise.all(take.marks.map(async (m, i) => {
  const fr = take.frames.filter((f) => f.t >= m.start - 0.05 && f.t <= m.end + 0.05);
  writeFileSync(join(work, 'seg', `${i}.txt`), fr.map((f, k) =>
    `file '${join(work, 'frames', f.file)}'\nduration ${Math.max(0.001, (fr[k + 1]?.t ?? f.t + 0.1) - f.t).toFixed(4)}`).join('\n')
    + `\nfile '${join(work, 'frames', fr.at(-1)!.file)}'\n`);
  const span = m.end - m.start, speed = Math.max(1, span / m.d);
  if (speed > 1.05) console.log(`cena ${m.id}: ${span.toFixed(1)} s → ${m.d} s (x${speed.toFixed(2)})`);
  const vf = [interp ? 'minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1' : 'fps=30',
    `setpts=(PTS-STARTPTS)/${speed.toFixed(4)}`, 'fps=30', 'tpad=stop_mode=clone:stop_duration=1', `trim=duration=${m.d}`, 'setpts=PTS-STARTPTS'].join(',');
  await ff(['-f', 'concat', '-safe', '0', '-i', join(work, 'seg', `${i}.txt`), '-vf', vf, '-c:v', 'libx264', '-crf', '10', '-preset', 'fast', '-pix_fmt', 'yuv420p', join(work, 'seg', `${i}.mp4`)]);
}));
writeFileSync(join(work, 'seg', 'all.txt'), take.marks.map((_, i) => `file '${join(work, 'seg', `${i}.mp4`)}'`).join('\n'));

// ---------- 2. camadas: legendas e barra de progresso (PNG com transparência) ----------
const browser = await chromium.launch();
const pg = await browser.newPage({ viewport: { width: W, height: 400 } });
await pg.setContent(`<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@600&display=swap" rel="stylesheet">
<style>html,body{margin:0;background:transparent}#s{display:inline-block;max-width:${V ? 968 : 1500}px;font:600 ${V ? 36 : 31}px/1.3 Inter;color:#fff;
padding:${V ? '16px 26px' : '14px 24px'};border-radius:14px;background:rgba(22,23,26,.86);border:1px solid rgba(255,255,255,.09);box-shadow:0 10px 30px rgba(0,0,0,.35)}
#bar{display:flex;gap:6px;width:${W}px;height:6px}#bar i{display:block;height:6px;background:rgba(255,255,255,.14)}
#mask{display:flex;gap:0;width:${W}px;height:6px}#mask i{display:block;height:6px}</style></head>
<body><div id="s"></div><div id="bar"></div><div id="mask"></div></body></html>`);
await pg.evaluate(() => document.fonts.ready);
const subMeta: { file: string; a: number; b: number; h: number }[] = [];
for (let i = 0; i < subs.length - 1; i++) {
  const [a, text] = subs[i], b = subs[i + 1][0];
  if (!text) continue;
  await pg.evaluate((t) => { document.getElementById('s')!.textContent = t; }, text);
  const el = pg.locator('#s');
  const box = (await el.boundingBox())!;
  const file = join(work, 'ov', `sub${i}.png`);
  await el.screenshot({ path: file, omitBackground: true });
  subMeta.push({ file, a, b: Math.min(b, total), h: Math.round(box.height) });
}
// Trilho com um segmento por cena (largura ∝ duração) e máscara dos vãos (cor do fundo) por cima do preenchimento.
const gaps = 6, usable = W - gaps * (take.marks.length - 1);
const widths = take.marks.map((m) => Math.round((m.d / total) * usable));
await pg.evaluate(([ws, g]) => {
  const bar = document.getElementById('bar')!, mask = document.getElementById('mask')!;
  (ws as number[]).forEach((w, k) => {
    const s = document.createElement('i'); s.style.width = w + 'px'; bar.append(s);
    const m = document.createElement('i'); m.style.width = w + 'px'; mask.append(m);
    if (k < (ws as number[]).length - 1) { const v = document.createElement('i'); v.style.cssText = `width:${g}px;background:#111214`; mask.append(v); }
  });
}, [widths, gaps]);
await pg.locator('#bar').screenshot({ path: join(work, 'ov', 'track.png'), omitBackground: true });
await pg.locator('#mask').screenshot({ path: join(work, 'ov', 'mask.png'), omitBackground: true });
await browser.close();

// ---------- 3. mestre ----------
const sx = V ? 56 : 64, bottom = V ? 96 : 40; // legenda: canto inferior esquerdo, acima da barra
const inputs = ['-f', 'concat', '-safe', '0', '-i', join(work, 'seg', 'all.txt'), '-i', audio,
  '-loop', '1', '-t', String(total), '-i', join(work, 'ov', 'track.png'),
  '-loop', '1', '-t', String(total), '-i', join(work, 'ov', 'mask.png'),
  '-f', 'lavfi', '-t', String(total), '-i', `color=c=0xE2611F:s=${W}x6:r=30`,
  ...subMeta.flatMap((s) => ['-loop', '1', '-t', String(total), '-i', s.file])];
const f: string[] = ['[0:v]setpts=PTS-STARTPTS[b0]'];
let last = 'b0';
subMeta.forEach((s, k) => {
  const fadeOut = Math.max(s.a + 0.2, s.b - 0.15);
  f.push(`[${5 + k}:v]format=rgba,fade=t=in:st=${s.a}:d=0.15:alpha=1,fade=t=out:st=${fadeOut.toFixed(2)}:d=0.15:alpha=1[s${k}]`);
  f.push(`[${last}][s${k}]overlay=x=${sx}:y=${H - bottom - s.h}:enable='between(t,${s.a},${s.b})'[b${k + 1}]`);
  last = `b${k + 1}`;
});
f.push(`[${last}][2:v]overlay=x=0:y=${H - 6}[p1]`);
f.push(`[p1][4:v]overlay=x='-${W}+${W}*t/${total}':y=${H - 6}:eval=frame[p2]`);
f.push(`[p2][3:v]overlay=x=0:y=${H - 6},fade=t=in:st=0:d=0.4,fade=t=out:st=${(total - 0.8).toFixed(2)}:d=0.8,format=yuv420p[v]`);
f.push(`[1:a]apad,atrim=duration=${total},afade=t=out:st=${(total - 0.6).toFixed(2)}:d=0.6[a]`);
const master = join(outDir, `${name}.mp4`);
await ff([...inputs, '-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]', '-t', String(total),
  '-c:v', 'libx264', '-crf', '15', '-preset', 'slow', '-profile:v', 'high', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', master]);
console.log(`mestre: ${master} (${(statSync(master).size / 1e6).toFixed(1)} MB)`);

// ---------- 4. versões para artifact (≤ 14,5 MB cada) ----------
const LIMIT = 14.5e6;
const av1 = join(outDir, `${name}-web-av1.mp4`);
for (const crf of [30, 33, 36, 39, 42]) {
  await ff(['-i', master, '-c:v', 'libsvtav1', '-crf', String(crf), '-preset', '5', '-svtav1-params', 'scm=1:tune=0', '-pix_fmt', 'yuv420p',
    '-g', '240', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', av1]);
  if (statSync(av1).size <= LIMIT) { console.log(`av1 crf ${crf}: ${(statSync(av1).size / 1e6).toFixed(1)} MB`); break; }
}
const h264 = join(outDir, `${name}-web-h264.mp4`);
const kbps = Math.floor((LIMIT * 8) / total / 1000 - 128 - 60);
for (const pass of [1, 2])
  await ff(['-i', master, '-c:v', 'libx264', '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.5)}k`, '-bufsize', `${kbps * 3}k`, '-preset', 'slow', '-tune', 'stillimage',
    '-pass', String(pass), '-passlogfile', join(work, 'x264'), '-pix_fmt', 'yuv420p',
    ...(pass === 1 ? ['-an', '-f', 'mp4', '/dev/null'] : ['-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', h264])]);
console.log(`h264 web: ${(statSync(h264).size / 1e6).toFixed(1)} MB (${kbps} kbps)`);

// ---------- 5. revisão ----------
mkdirSync(join(work, 'review'), { recursive: true });
let at = 0;
for (const m of take.marks) {
  await ff(['-ss', (at + m.d * 0.6).toFixed(2), '-i', master, '-frames:v', '1', '-q:v', '3', join(work, 'review', `${m.id}.jpg`)]);
  at += m.d;
}
console.log(`ok (${total.toFixed(1)} s)`);
