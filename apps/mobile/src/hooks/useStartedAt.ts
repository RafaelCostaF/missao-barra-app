import { useEffect, useState } from 'react';
import { api } from '@/lib/services';

/** Hora em que a pessoa iniciou/finalizou o percurso (auditoria do servidor): base do tempo e do pace médio. */
export function useStartedAt(sessionId: string, userId: string, status?: string) {
  const [at, setAt] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  useEffect(() => {
    if (!userId) return;
    void api.timeline(sessionId, userId).then((ev) => setAt({
      start: ev.find((e) => e.event === 'tracking')?.at ?? null,
      end: [...ev].reverse().find((e) => e.event === 'finished')?.at ?? null,
    })).catch(() => undefined);
  }, [sessionId, userId, status]);
  return at;
}
