import { useEffect, useState } from 'react';

/** Relógio que atualiza o estado "sinal desatualizado" sem depender de novos dados. */
export function useNow(everyMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
