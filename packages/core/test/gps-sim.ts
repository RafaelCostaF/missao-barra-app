import type { Fix } from '../src';

/** Percurso de referência (Farol de Itapuã → Farol da Barra), coordenadas dos pontos de apoio. */
export const ROUTE = [
  { lat: -12.9570655, lng: -38.3536886 },
  { lat: -12.9681066, lng: -38.4057227 },
  { lat: -13.0012074, lng: -38.4495862 },
  { lat: -13.0126185, lng: -38.4920669 },
  { lat: -13.0101987, lng: -38.5329168 },
];

/** Gera fixes caminhando a ~1,4 m/s, um a cada `everyS` segundos, com ruído e alguns fixes ruins. */
export function walk(opts: { seconds: number; everyS?: number; noiseM?: number; badEvery?: number; start?: number }): Fix[] {
  const { seconds, everyS = 20, noiseM = 3, badEvery = 0, start = Date.parse('2026-12-06T05:30:00-03:00') } = opts;
  const speed = 1.4;
  const fixes: Fix[] = [];
  let rnd = 42;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647 - 0.5) * 2; // determinístico
  for (let t = 0, i = 0; t <= seconds; t += everyS, i++) {
    const p = along(t * speed);
    const bad = badEvery > 0 && i > 0 && i % badEvery === 0;
    const n = bad ? 300 : noiseM;
    fixes.push({
      lat: p.lat + (rand() * n) / 111_000,
      lng: p.lng + (rand() * n) / 108_000,
      accuracy: bad ? 250 : 6,
      recordedAt: new Date(start + t * 1000).toISOString(),
    });
  }
  return fixes;
}

function along(meters: number) {
  // Aproximação local: segmentos retos entre os pontos do percurso.
  let left = meters;
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const a = ROUTE[i], b = ROUTE[i + 1];
    const dLat = (b.lat - a.lat) * 111_000, dLng = (b.lng - a.lng) * 108_000;
    const len = Math.hypot(dLat, dLng);
    if (left <= len) return { lat: a.lat + (b.lat - a.lat) * (left / len), lng: a.lng + (b.lng - a.lng) * (left / len) };
    left -= len;
  }
  return ROUTE[ROUTE.length - 1];
}
