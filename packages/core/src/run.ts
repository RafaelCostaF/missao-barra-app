// Métricas do corredor (como relógios GPS): pace atual/médio, parciais por km, progresso no percurso,
// estimativas de chegada e quem corre perto. Tudo puro: o app só alimenta fixes e dados ao vivo.
import { haversine, MAX_ACCURACY_M } from './geo';
import { getSignalState } from './signal';
import type { LiveParticipant } from './api';
import type { Checkpoint, Fix, Point } from './types';

/** Abaixo disso a pessoa está parada (≈ 1,8 km/h). */
const MOVING_MPS = 0.5;
/** Janela do pace atual (como "pace de volta corrente" dos relógios). */
const CURRENT_WINDOW_S = 180;
/** Intervalos maiores que isso (GPS sem sinal) não contam como tempo em movimento. */
const MAX_GAP_S = 90;

export interface RunSnapshot {
  /** Distância medida neste aparelho desde o início (ou desde que o app abriu). */
  distanceM: number;
  movingS: number;
  /** s/km nos últimos ~3 min; null parado ou sem dados. */
  currentPaceS: number | null;
  /** s/km considerando só o tempo em movimento. */
  movingPaceS: number | null;
  speedKmh: number | null;
  /** Tempo (s) de cada km completo. */
  splits: number[];
  lastAccuracyM: number | null;
  lastFixAt: string | null;
}

/** Acumula fixes do GPS e calcula métricas. Fixes imprecisos são ignorados (mesmo critério da distância enviada). */
export function createRunStats() {
  let fixes: { t: number; p: Point; d: number }[] = []; // d = distância acumulada até o fix
  let distance = 0, moving = 0, lastAccuracy: number | null = null;
  const splits: number[] = [];
  let splitStartT: number | null = null;

  return {
    reset() {
      fixes = [];
      distance = 0;
      moving = 0;
      lastAccuracy = null;
      splits.length = 0;
      splitStartT = null;
    },
    add(batch: Fix[]) {
      for (const f of [...batch].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) {
        lastAccuracy = f.accuracy;
        if (f.accuracy > MAX_ACCURACY_M) continue;
        const t = Date.parse(f.recordedAt);
        const prev = fixes.at(-1);
        if (!prev) {
          fixes.push({ t, p: f, d: 0 });
          splitStartT = t;
          continue;
        }
        if (t <= prev.t) continue;
        const step = haversine(prev.p, f);
        const dt = (t - prev.t) / 1000;
        if (step < 5 && dt < MAX_GAP_S) continue; // ruído parado
        if (dt <= MAX_GAP_S && step / dt >= MOVING_MPS) moving += dt;
        const before = distance;
        distance += step;
        // Parciais: interpola o instante em que cada km foi completado.
        for (let k = Math.floor(before / 1000) + 1; k <= Math.floor(distance / 1000); k++) {
          const at = prev.t + ((k * 1000 - before) / step) * (t - prev.t);
          splits.push(Math.round((at - splitStartT!) / 1000));
          splitStartT = at;
        }
        fixes.push({ t, p: f, d: distance });
        if (fixes.length > 2000) fixes = fixes.slice(-1000);
      }
    },
    snapshot(now = Date.now()): RunSnapshot {
      const last = fixes.at(-1);
      let currentPaceS: number | null = null, speedKmh: number | null = null;
      if (last && now - last.t < MAX_GAP_S * 1000) {
        const from = fixes.find((f) => f.t >= last.t - CURRENT_WINDOW_S * 1000) ?? last;
        const dt = (last.t - from.t) / 1000, dd = last.d - from.d;
        if (dt >= 30 && dd / dt >= MOVING_MPS) {
          currentPaceS = dt / (dd / 1000);
          speedKmh = (dd / dt) * 3.6;
        }
      }
      return {
        distanceM: distance,
        movingS: Math.round(moving),
        currentPaceS,
        movingPaceS: distance >= 100 && moving ? moving / (distance / 1000) : null,
        speedKmh,
        splits: [...splits],
        lastAccuracyM: lastAccuracy,
        lastFixAt: last ? new Date(last.t).toISOString() : null,
      };
    },
  };
}
export type RunStats = ReturnType<typeof createRunStats>;

/** "5:42" (min/km); "—" sem valor. */
export function fmtPace(sPerKm: number | null | undefined) {
  if (sPerKm == null || !Number.isFinite(sPerKm) || sPerKm <= 0 || sPerKm > 60 * 60) return '—';
  const s = Math.round(sPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "1:05:09" / "42:10" */
export function fmtClock(totalS: number | null | undefined) {
  if (totalS == null || !Number.isFinite(totalS) || totalS < 0) return '—';
  const s = Math.round(totalS), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Pace médio desde a largada (tempo total, inclui paradas) com dados do servidor — disponível ao abrir a tela. */
export const averagePaceS = (startedAt: string | null, distanceM: number, now = Date.now()) =>
  startedAt && distanceM >= 100 ? (now - Date.parse(startedAt)) / 1000 / (distanceM / 1000) : null;

// ---------- percurso ----------
const toXY = (p: Point, lat0: number) => ({ x: p.lng * 111_320 * Math.cos((lat0 * Math.PI) / 180), y: p.lat * 110_574 });

export interface RouteProgress {
  /** km do percurso (escala dos pontos de apoio) onde a pessoa está. */
  km: number;
  /** Distância até a linha do percurso, em metros. */
  offRouteM: number;
}

/** Projeta a posição na linha entre pontos de apoio e converte para o km oficial (interpola entre os km cadastrados). */
export function routeProgress(p: Point, checkpoints: Checkpoint[]): RouteProgress | null {
  const route = [...checkpoints].sort((a, b) => a.km - b.km);
  if (route.length < 2) return null;
  const lat0 = route[0].lat, q = toXY(p, lat0);
  let best: RouteProgress = { km: route[0].km, offRouteM: Infinity };
  for (let i = 0; i < route.length - 1; i++) {
    const a = toXY(route[i], lat0), b = toXY(route[i + 1], lat0);
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2));
    const off = Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
    if (off < best.offRouteM) best = { km: route[i].km + t * (route[i + 1].km - route[i].km), offRouteM: off };
  }
  return best;
}

/** Acima disso a projeção no percurso não é confiável: usa a distância medida pelo GPS. */
export const ROUTE_TRUST_M = 300;

export interface Eta {
  name: string; km: number; remainingM: number; etaS: number | null; at: string | null;
  /** Distância em linha reta (pessoa fora do percurso), não pelo percurso. */
  straight?: boolean;
}

/** Faltam X km até o ponto, estimativa no pace informado (s/km) e horário previsto de chegada. */
export function etaTo(target: { name: string; km: number }, kmNow: number, paceS: number | null, now = Date.now()): Eta {
  const remainingM = Math.max(0, (target.km - kmNow) * 1000);
  const etaS = paceS ? (remainingM / 1000) * paceS : null;
  return { name: target.name, km: target.km, remainingM, etaS, at: etaS != null ? new Date(now + etaS * 1000).toISOString() : null };
}

/** Próximo ponto de apoio e chegada a partir do km atual. */
export function routeEtas(checkpoints: Checkpoint[], kmNow: number, paceS: number | null, now = Date.now()) {
  const route = [...checkpoints].sort((a, b) => a.km - b.km);
  const next = route.find((c) => c.km > kmNow + 0.02);
  const finish = route.at(-1);
  return {
    next: next ? etaTo(next, kmNow, paceS, now) : null,
    finish: finish && finish.km > kmNow + 0.02 ? etaTo(finish, kmNow, paceS, now) : null,
  };
}

export interface RouteStatus {
  /** Perto da linha do percurso (≤ ROUTE_TRUST_M). */
  onRoute: boolean;
  /** km do percurso onde a pessoa está; null fora do percurso ou sem posição. */
  kmNow: number | null;
  offRouteM: number | null;
  next: Eta | null;
  finish: Eta | null;
}

/**
 * Onde a pessoa está em relação ao percurso — sempre a partir da posição real, nunca do ponto zero.
 * No percurso: próximo ponto à frente pelo km. Fora dele: o ponto de apoio mais perto (em linha reta),
 * e a chegada soma essa distância ao trecho que falta a partir desse ponto. Sem posição: nada (não chuta).
 */
export function routeStatus(pos: Point | null, checkpoints: Checkpoint[], paceS: number | null, now = Date.now()): RouteStatus {
  const route = [...checkpoints].sort((a, b) => a.km - b.km);
  const none: RouteStatus = { onRoute: false, kmNow: null, offRouteM: null, next: null, finish: null };
  if (!pos || !route.length) return none;
  const prog = route.length > 1 ? routeProgress(pos, route) : null;
  if (prog && prog.offRouteM <= ROUTE_TRUST_M) return { onRoute: true, kmNow: prog.km, offRouteM: prog.offRouteM, ...routeEtas(route, prog.km, paceS, now) };

  const eta = (c: Checkpoint, remainingM: number): Eta => {
    const etaS = paceS ? (remainingM / 1000) * paceS : null;
    return { name: c.name, km: c.km, remainingM, etaS, at: etaS != null ? new Date(now + etaS * 1000).toISOString() : null, straight: true };
  };
  const nearest = route.map((c) => ({ c, d: haversine(pos, c) })).sort((a, b) => a.d - b.d)[0];
  const last = route.at(-1)!;
  return {
    onRoute: false, kmNow: null, offRouteM: prog?.offRouteM ?? nearest.d,
    next: eta(nearest.c, nearest.d),
    finish: last === nearest.c ? null : eta(last, nearest.d + (last.km - nearest.c.km) * 1000),
  };
}

// ---------- quem está perto ----------
export interface Nearby {
  user_id: string;
  name: string;
  /** Distância em linha reta (m). */
  distanceM: number;
  /** >0 à frente, <0 atrás, pelo percurso (m); null sem percurso. */
  aheadM: number | null;
}

/** Corredores com posição recente perto de mim, mais próximos primeiro. */
export function nearbyRunners(me: Point, myKm: number | null, others: LiveParticipant[], checkpoints: Checkpoint[], maxM = 2000, now = Date.now()): Nearby[] {
  return others
    .filter((o) => o.status === 'tracking' && o.last_lat != null && o.last_lng != null && getSignalState(o as never, now) === 'tracking')
    .map((o) => {
      const p = { lat: o.last_lat!, lng: o.last_lng! };
      const prog = myKm != null ? routeProgress(p, checkpoints) : null;
      return {
        user_id: o.user_id,
        name: o.display_name,
        distanceM: haversine(me, p),
        aheadM: prog && prog.offRouteM <= ROUTE_TRUST_M ? Math.round((prog.km - myKm!) * 1000) : null,
      };
    })
    .filter((n) => n.distanceM <= maxM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

/** Posição na prova pela distância percorrida (entre quem está correndo ou terminou) e quem vem logo à frente. */
export function racePosition(myId: string, participants: Pick<LiveParticipant, 'user_id' | 'display_name' | 'status' | 'distance_m'>[]) {
  const field = participants.filter((p) => p.status === 'tracking' || p.status === 'finished').sort((a, b) => b.distance_m - a.distance_m);
  const i = field.findIndex((p) => p.user_id === myId);
  if (i < 0) return null;
  const ahead = i > 0 ? field[i - 1] : null;
  return { position: i + 1, total: field.length, ahead: ahead ? { name: ahead.display_name, gapM: Math.round(ahead.distance_m - field[i].distance_m) } : null };
}
