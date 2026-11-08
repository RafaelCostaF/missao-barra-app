import type { Checkpoint, Fix, Point } from './types';

const EARTH_RADIUS_M = 6_371_000;
/** Fixes com precisão pior que isso não entram no cálculo de distância. */
export const MAX_ACCURACY_M = 30;
/** Saltos menores que isso são ruído de GPS parado. */
const MIN_STEP_M = 5;

const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Distância acumulada a partir de `prev` (último fix confiável), ignorando fixes imprecisos. */
export function accumulate(prev: Fix | null, fixes: Fix[]): { distance: number; last: Fix | null } {
  let distance = 0;
  let last = prev;
  for (const f of fixes) {
    if (f.accuracy > MAX_ACCURACY_M) continue;
    if (last) {
      const step = haversine(last, f);
      if (step < MIN_STEP_M) continue;
      distance += step;
    }
    last = f;
  }
  return { distance, last };
}

/** Próximo ponto de apoio pelo km percorrido; null se não houver percurso. */
export function nextCheckpoint(checkpoints: Checkpoint[], distanceM: number): Checkpoint | null {
  const km = distanceM / 1000;
  return [...checkpoints].sort((a, b) => a.km - b.km).find((c) => c.km > km) ?? null;
}

/** Formato de localização do expo-location (e da Geolocation API do navegador). */
export interface DeviceLocation {
  coords: { latitude: number; longitude: number; accuracy: number | null };
  timestamp: number;
}

export function toFix(l: DeviceLocation): Fix {
  return {
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracy: l.coords.accuracy ?? Number.POSITIVE_INFINITY, // sem precisão → nunca entra na distância
    recordedAt: new Date(l.timestamp).toISOString(),
  };
}

/** Comprimento da rota (sequência de pontos) em metros. */
export function routeLength(route: Point[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += haversine(route[i - 1], route[i]);
  return total;
}

/** Ponto a `meters` do início, seguindo a rota; para no último ponto (não "passa da chegada"). */
export function pointAlong(route: Point[], meters: number): Point {
  let left = Math.max(0, meters);
  for (let i = 1; i < route.length; i++) {
    const seg = haversine(route[i - 1], route[i]);
    if (left <= seg) {
      const t = seg ? left / seg : 0;
      const a = route[i - 1], b = route[i];
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    }
    left -= seg;
  }
  return route[route.length - 1];
}
