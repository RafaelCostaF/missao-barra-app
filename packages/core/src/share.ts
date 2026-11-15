// Compartilhar corrida: trilha da pessoa → resumo, desenho do percurso, quadros do vídeo e GPX (Strava).
// Tudo puro: o app desenha (canvas no WebView) e compartilha; aqui só dados e textos já formatados.
import { haversine, MAX_ACCURACY_M } from './geo';
import { createRunStats, fmtClock, fmtPace } from './run';
import type { Fix, Point } from './types';

export interface TrackPoint extends Point {
  /** ms epoch */
  t: number;
  /** distância acumulada (m) */
  d: number;
}

/** Mesmo critério das métricas ao vivo: descarta fixes imprecisos, fora de ordem e ruído parado. */
export function buildTrack(fixes: Fix[]): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (const f of [...fixes].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) {
    if (!(f.accuracy <= MAX_ACCURACY_M) || !Number.isFinite(f.lat) || !Number.isFinite(f.lng)) continue;
    const t = Date.parse(f.recordedAt);
    const prev = out.at(-1);
    if (!prev) {
      out.push({ lat: f.lat, lng: f.lng, t, d: 0 });
      continue;
    }
    if (t <= prev.t) continue;
    const step = haversine(prev, f);
    if (step < 5 && t - prev.t < 90_000) continue;
    out.push({ lat: f.lat, lng: f.lng, t, d: prev.d + step });
  }
  return out;
}

/** Linha do RPC `my_track`: [lat, lng, precisão, ms epoch]. */
export const trackRowsToFixes = (rows: [number, number, number | null, number][]): Fix[] =>
  rows.map(([lat, lng, accuracy, t]) => ({ lat, lng, accuracy: accuracy ?? 0, recordedAt: new Date(t).toISOString() }));

export interface ShareStat {
  label: string;
  value: string;
  unit?: string;
}

export interface TrackSummary {
  distanceM: number;
  elapsedS: number | null;
  movingS: number;
  /** pace pelo tempo total (igual ao resumo do app) */
  paceS: number | null;
  movingPaceS: number | null;
  splits: number[];
  startedAt: number | null;
  endedAt: number | null;
}

/**
 * Resumo para a arte. Distância/início/fim oficiais (os mesmos do resumo do app) têm prioridade;
 * a trilha completa o que faltar e dá tempo em movimento e parciais.
 */
export function summarizeTrack(track: TrackPoint[], official: { distanceM?: number | null; startedAt?: string | null; endedAt?: string | null } = {}): TrackSummary {
  const stats = createRunStats();
  stats.add(track.map((p) => ({ lat: p.lat, lng: p.lng, accuracy: 5, recordedAt: new Date(p.t).toISOString() })));
  const snap = stats.snapshot(track.at(-1)?.t ?? Date.now());
  const startedAt = official.startedAt ? Date.parse(official.startedAt) : track[0]?.t ?? null;
  const endedAt = official.endedAt ? Date.parse(official.endedAt) : track.at(-1)?.t ?? null;
  const distanceM = official.distanceM && official.distanceM > 0 ? official.distanceM : track.at(-1)?.d ?? 0;
  const elapsedS = startedAt != null && endedAt != null && endedAt > startedAt ? (endedAt - startedAt) / 1000 : null;
  return {
    distanceM,
    elapsedS,
    movingS: snap.movingS,
    paceS: elapsedS && distanceM >= 100 ? elapsedS / (distanceM / 1000) : null,
    movingPaceS: snap.movingPaceS,
    splits: snap.splits,
    startedAt,
    endedAt,
  };
}

const km = (m: number, digits = 2) => (m / 1000).toFixed(digits).replace('.', ',');

/** Os números da arte, na ordem de destaque. */
export function shareStats(s: TrackSummary): ShareStat[] {
  const out: ShareStat[] = [
    { label: 'Distância', value: km(s.distanceM), unit: 'km' },
    { label: 'Tempo', value: fmtClock(s.elapsedS ?? (s.movingS || null)) },
    { label: 'Pace médio', value: fmtPace(s.paceS ?? s.movingPaceS), unit: '/km' },
  ];
  if (s.movingS > 0 && s.elapsedS && s.elapsedS - s.movingS > 120) out.push({ label: 'Em movimento', value: fmtClock(s.movingS) });
  if (s.splits.length >= 2) out.push({ label: 'Melhor km', value: fmtPace(Math.min(...s.splits)), unit: '/km' });
  return out;
}

/** Reduz a trilha para desenhar (mantém primeiro e último). */
export function downsample<T>(pts: T[], max: number): T[] {
  if (pts.length <= max) return pts;
  const step = (pts.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => pts[Math.round(i * step)]);
}

/**
 * Projeta pontos (norte para cima) numa caixa unitária com proporção preservada:
 * x ∈ [0, ax], y ∈ [0, ay], max(ax, ay) = 1. `extra` entra no enquadramento (percurso oficial).
 */
export function projectTracks(main: Point[], extra: Point[] = []) {
  const all = [...main, ...extra];
  if (!all.length) return { ax: 1, ay: 1, main: [] as [number, number][], extra: [] as [number, number][] };
  const lat0 = all.reduce((a, p) => a + p.lat, 0) / all.length;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180), ky = 110_574;
  const xs = all.map((p) => p.lng * kx), ys = all.map((p) => -p.lat * ky);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const w = Math.max(...xs) - minX, h = Math.max(...ys) - minY;
  const span = Math.max(w, h, 1);
  const f = (p: Point): [number, number] => [round4((p.lng * kx - minX) / span), round4((-p.lat * ky - minY) / span)];
  return { ax: round4(Math.max(w / span, 0.001)), ay: round4(Math.max(h / span, 0.001)), main: main.map(f), extra: extra.map(f) };
}
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export interface ReplayFrame {
  /** índice fracionário na trilha desenhada */
  i: number;
  /** horário real daquele ponto ("06:42") */
  clock: string;
  elapsed: string;
  km: string;
  pace: string;
}

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * Quadros do vídeo: avança pela distância (paradas longas não "congelam" o vídeo) com aceleração suave,
 * mostrando o horário real, tempo, km e pace dos últimos ~3 min daquele trecho.
 */
export function replayFrames(track: TrackPoint[], count: number, clock: (ms: number) => string = hhmm): ReplayFrame[] {
  if (track.length < 2 || count < 2) return [];
  const total = track.at(-1)!.d, t0 = track[0].t;
  const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
  const frames: ReplayFrame[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = ease(k / (count - 1)) * total;
    while (j < track.length - 2 && track[j + 1].d < target) j++;
    const a = track[j], b = track[j + 1];
    const f = b.d > a.d ? Math.min(1, Math.max(0, (target - a.d) / (b.d - a.d))) : 1;
    const t = a.t + (b.t - a.t) * f;
    // pace "atual" daquele trecho
    let w = j;
    while (w > 0 && track[w].t > t - 180_000) w--;
    const dd = target - track[w].d, dt = (t - track[w].t) / 1000;
    frames.push({
      i: j + f,
      clock: clock(t),
      elapsed: fmtClock((t - t0) / 1000),
      km: km(target),
      pace: dd > 50 && dt > 20 ? fmtPace(dt / (dd / 1000)) : '—',
    });
  }
  return frames;
}

/** Ajusta o índice dos quadros quando a trilha desenhada foi reduzida com `downsample`. */
export function rescaleFrames(frames: ReplayFrame[], fromLength: number, toLength: number): ReplayFrame[] {
  if (fromLength <= 1 || fromLength === toLength) return frames;
  const k = (toLength - 1) / (fromLength - 1);
  return frames.map((f) => ({ ...f, i: round4(f.i * k) }));
}

const xml = (s: string) => s.replace(/[<>&'"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[ch]!);

/** GPX 1.1 com horário em cada ponto: o Strava (strava.com/upload) importa como atividade. */
export function toGPX(track: TrackPoint[], name: string, type = 'running') {
  const pts = track.map((p) => `<trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}"><time>${new Date(p.t).toISOString()}</time></trkpt>`).join('\n      ');
  const time = track[0] ? `\n  <metadata><name>${xml(name)}</name><time>${new Date(track[0].t).toISOString()}</time></metadata>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Missão Barra" xmlns="http://www.topografix.com/GPX/1/1">${time}
  <trk>
    <name>${xml(name)}</name>
    <type>${type}</type>
    <trkseg>
      ${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

/** Nome de arquivo seguro: "missao-barra-6a-edicao-2026-12-13". */
export function shareFileName(title: string, at: number | null, ext: string) {
  const slug = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'corrida';
  const date = at ? new Date(at).toISOString().slice(0, 10) : '';
  return `${slug}${date ? `-${date}` : ''}.${ext}`;
}

/** "13 de dezembro de 2026 · 05:12" sem depender do Intl do aparelho. */
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function shareDate(ms: number | null) {
  if (ms == null) return '';
  const d = new Date(ms);
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()} · ${hhmm(ms)}`;
}

export type ShareLayout = 'farol' | 'cartao' | 'mapa' | 'faixa';
export type ShareFormat = 'story' | 'post';

/** Modelos prontos (o app mostra todos; cada pessoa escolhe o seu). */
export const SHARE_LAYOUTS: { id: ShareLayout; label: string; hint: string }[] = [
  { id: 'farol', label: 'Farol', hint: 'Foto inteira, números embaixo' },
  { id: 'cartao', label: 'Cartão', hint: 'Foto em cima, cartão com percurso' },
  { id: 'mapa', label: 'Percurso', hint: 'Percurso grande em destaque' },
  { id: 'faixa', label: 'Faixa', hint: 'Faixa laranja da marca' },
];

export const SHARE_FORMATS: Record<ShareFormat, { label: string; w: number; h: number }> = {
  story: { label: 'Story 9:16', w: 1080, h: 1920 },
  post: { label: 'Feed 4:5', w: 1080, h: 1350 },
};

/** Tudo que o desenho precisa (as imagens vão à parte, por serem grandes). */
export interface ShareScene {
  layout: ShareLayout;
  format: ShareFormat;
  w: number;
  h: number;
  title: string;
  subtitle: string;
  name: string;
  stats: ShareStat[];
  ax: number;
  ay: number;
  track: [number, number][];
  ghost: [number, number][];
  frames: ReplayFrame[];
  /** tem foto de fundo (galeria/câmera ou do Farol) */
  photo: boolean;
}

/** Monta a cena: trilha (ou percurso oficial, se não houver trilha) projetada + textos + quadros do vídeo. */
export function buildShareScene(input: {
  track: TrackPoint[];
  route?: Point[];
  summary: TrackSummary;
  title: string;
  name: string;
  layout: ShareLayout;
  format: ShareFormat;
  photo: boolean;
  frameCount?: number;
  clock?: (ms: number) => string;
}): ShareScene {
  const drawn = downsample(input.track, 600);
  const ghost = downsample(input.route ?? [], 400);
  const proj = projectTracks(drawn, ghost);
  const frames = input.frameCount ? rescaleFrames(replayFrames(input.track, input.frameCount, input.clock), input.track.length, drawn.length) : [];
  const { w, h } = SHARE_FORMATS[input.format];
  return {
    layout: input.layout,
    format: input.format,
    w,
    h,
    title: input.title,
    subtitle: shareDate(input.summary.startedAt),
    name: input.name,
    stats: shareStats(input.summary),
    ax: proj.ax,
    ay: proj.ay,
    track: proj.main,
    ghost: proj.extra,
    frames,
    photo: input.photo,
  };
}
