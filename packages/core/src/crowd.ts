import { getSignalState } from './signal';
import type { Checkpoint, Point } from './types';
import type { LiveParticipant } from './api';

/** Fora do percurso a partir de quantos metros da linha entre pontos de apoio. */
export const OFF_ROUTE_M = 300;
const MAX_ATTENTION = 5;

export interface Attention { user_id: string; name: string; reason: 'stale' | 'off_route' | 'behind'; detail: string }
export interface CrowdAnalysis {
  positioned: number;
  /** Trechos entre pontos de apoio, com quem está em cada um (clicável no painel). */
  segments: { label: string; count: number; user_ids: string[] }[];
  majority: { label: string; share: number } | null;
  /** Os mais urgentes (cartão "Atenção"). */
  attention: Attention[];
  /** Todos os fora do padrão, sem limite (filtros e destaque no mapa). */
  outliers: Attention[];
}

// Projeção local em metros (equiretangular): suficiente para distâncias de poucos km.
const toXY = (p: Point, lat0: number) => ({ x: p.lng * 111_320 * Math.cos((lat0 * Math.PI) / 180), y: p.lat * 110_574 });

/** Posição de um ponto na rota: trecho mais próximo, distância percorrida ao longo da rota e afastamento lateral. */
function locate(p: Point, route: Point[], lat0: number) {
  const q = toXY(p, lat0);
  let best = { seg: 0, along: 0, off: Infinity };
  let acc = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = toXY(route[i], lat0), b = toXY(route[i + 1], lat0);
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2));
    const off = Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
    if (off < best.off) best = { seg: i, along: acc + t * Math.sqrt(len2), off };
    acc += Math.sqrt(len2);
  }
  return best;
}

const quantile = (s: number[], q: number) => s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
const mins = (ms: number) => `${Math.round(ms / 60_000)} min sem sinal`;

/** Leitura operacional do evento: onde está a maioria e quem precisa de atenção. */
export function analyzeCrowd(participants: LiveParticipant[], checkpoints: Checkpoint[], now = Date.now()): CrowdAnalysis {
  const route = [...checkpoints].sort((a, b) => a.km - b.km);
  const active = participants.filter((p) => p.status === 'tracking');
  const attention: Attention[] = [];

  for (const p of active)
    if (getSignalState(p as never, now) === 'stale')
      attention.push({ user_id: p.user_id, name: p.display_name, reason: 'stale', detail: mins(now - Date.parse(p.last_at!)) });

  const positioned = active.filter((p) => p.last_lat != null && p.last_lng != null);
  if (route.length < 2) return { positioned: positioned.length, segments: [], majority: null, attention: attention.slice(0, MAX_ATTENTION), outliers: attention };

  const lat0 = route[0].lat;
  const located = positioned.map((p) => ({ p, ...locate({ lat: p.last_lat!, lng: p.last_lng! }, route, lat0) }));
  const segments = route.slice(0, -1).map((c, i) => {
    const here = located.filter((l) => l.seg === i).sort((a, b) => b.along - a.along); // quem vai mais à frente primeiro
    return { label: `${c.name} → ${route[i + 1].name}`, count: here.length, user_ids: here.map((l) => l.p.user_id) };
  });
  const top = segments.reduce((m, s) => (s.count > m.count ? s : m), segments[0]);
  const majority = located.length ? { label: top.label, share: top.count / located.length } : null;

  for (const l of located)
    if (l.off > OFF_ROUTE_M) attention.push({ user_id: l.p.user_id, name: l.p.display_name, reason: 'off_route', detail: `${Math.round(l.off)} m fora do percurso` });

  // Retardatários: bem atrás do grupo (abaixo de Q1 − 1,5·IQR e ≥ 2 km atrás da mediana).
  if (located.length >= 5) {
    const s = located.map((l) => l.along).sort((a, b) => a - b);
    const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), med = quantile(s, 0.5);
    const limit = Math.min(q1 - 1.5 * (q3 - q1), med - 2000);
    for (const l of located)
      if (l.along < limit) attention.push({ user_id: l.p.user_id, name: l.p.display_name, reason: 'behind', detail: `${((med - l.along) / 1000).toFixed(1)} km atrás do grupo` });
  }

  const seen = new Set<string>();
  const unique = attention.filter((a) => !seen.has(a.user_id) && seen.add(a.user_id));
  return { positioned: located.length, segments, majority, attention: unique.slice(0, MAX_ATTENTION), outliers: attention };
}
