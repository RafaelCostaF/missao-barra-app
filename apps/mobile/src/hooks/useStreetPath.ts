import { useEffect, useState } from 'react';
import { lineToPoints, snapRoute, type Checkpoint, type Point, type RouteLine } from '@mb/core';

/**
 * Caminho pelas ruas do percurso. Usa o salvo no evento; se o evento é antigo (sem desenho pelas ruas),
 * calcula na hora com o mesmo roteador gratuito (a pé) — nunca mostra linhas retas se der para evitar.
 */
export function useStreetPath(route: RouteLine | null | undefined, checkpoints: Checkpoint[]): Point[] | null {
  const saved = lineToPoints(route);
  const pts = [...checkpoints].sort((a, b) => a.km - b.km).map((c) => ({ lat: c.lat, lng: c.lng }));
  const key = saved ? '' : pts.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';');
  const [computed, setComputed] = useState<{ key: string; path: Point[] } | null>(null);
  useEffect(() => {
    if (!key || pts.length < 2) return;
    let alive = true;
    snapRoute(pts).then((r) => alive && setComputed({ key, path: lineToPoints(r)! })).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return saved ?? (computed?.key === key ? computed.path : null);
}

/**
 * Fora do percurso: caminho pelas ruas da posição atual até o ponto de apoio mais perto.
 * Recalcula só quando a pessoa anda ~100 m ou o destino muda (serviço gratuito, sem abuso).
 */
export function useStreetApproach(from: Point | null, to: Point | null): Point[] | null {
  const key = from && to ? `${from.lat.toFixed(3)},${from.lng.toFixed(3)}>${to.lat.toFixed(5)},${to.lng.toFixed(5)}` : '';
  const [res, setRes] = useState<{ key: string; path: Point[] } | null>(null);
  useEffect(() => {
    if (!key || !from || !to) return;
    let alive = true;
    const t = setTimeout(() => {
      snapRoute([from, to]).then((r) => alive && setRes({ key, path: lineToPoints(r)! })).catch(() => undefined);
    }, 400);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!from || !to || !res) return null;
  // Começa da posição de agora (o cálculo pode ser de até ~100 m atrás).
  return res.key === key ? [from, ...res.path] : null;
}
