import type { Point } from './types';

/** Roteador a pé do OpenStreetMap (FOSSGIS): gratuito, sem chave. Usado só ao salvar o percurso. */
export const FOOT_ROUTER = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving';

/** GeoJSON LineString guardado em sessions.route ([lng, lat]). */
export interface RouteLine { type: 'LineString'; coordinates: [number, number][] }

export const lineToPoints = (r: RouteLine | null | undefined): Point[] | null =>
  r?.coordinates?.length && r.coordinates.length > 1 ? r.coordinates.map(([lng, lat]) => ({ lat, lng })) : null;

/**
 * Caminho real pelas ruas/calçadas passando pelos pontos de apoio, na ordem.
 * Lança erro se o serviço falhar (quem chama decide manter a linha reta).
 */
export async function snapRoute(points: Point[], fetchImpl: typeof fetch = fetch): Promise<RouteLine> {
  if (points.length < 2) throw new Error('precisa de 2+ pontos');
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const res = await fetchImpl(`${FOOT_ROUTER}/${coords}?overview=full&geometries=geojson`);
  const body = (await res.json().catch(() => null)) as { code?: string; routes?: { geometry: RouteLine }[] } | null;
  if (!res.ok || body?.code !== 'Ok' || !body.routes?.[0]) throw new Error(`roteamento indisponível (${body?.code ?? res.status})`);
  return { type: 'LineString', coordinates: body.routes[0].geometry.coordinates.map(([lng, lat]) => [+lng.toFixed(6), +lat.toFixed(6)]) };
}
