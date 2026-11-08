import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

/** Bússola do aparelho (graus, 0 = norte): para onde o celular está apontando. null sem bússola. */
export function useHeading(enabled = true) {
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;
    let last = -999;
    Location.watchHeadingAsync((e) => {
      const v = e.trueHeading >= 0 ? e.trueHeading : e.magHeading;
      if (v == null || v < 0) return;
      // Ignora tremidas pequenas da bússola (evita o mapa girando sem parar).
      if (Math.abs(((v - last + 540) % 360) - 180) < 5) return;
      last = v;
      setHeading(v);
    }).then((s) => (cancelled ? s.remove() : (sub = s))).catch(() => undefined);
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);
  return heading;
}
