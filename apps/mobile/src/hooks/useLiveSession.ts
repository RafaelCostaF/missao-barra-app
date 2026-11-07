import { useCallback, useEffect, useRef, useState } from 'react';
import type { Alert, Checkpoint, LiveParticipant, Session } from '@mb/core';
import { api, logger, supabase } from '@/lib/services';

/** Dados da sessão + atualização ao vivo (Realtime dispara recarga com debounce). */
export function useLiveSession(id: string) {
  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const reload = useCallback(async () => {
    try {
      const [s, p, a] = await Promise.all([api.session(id), api.live(id), api.alerts(id)]);
      setSession(s);
      setParticipants(p);
      setAlerts(a);
    } catch (e) {
      void logger.error('api.live_session', e, { session_id: id });
    }
  }, [id]);

  useEffect(() => {
    void reload();
    void api.checkpoints(id).then(setCheckpoints).catch(() => undefined);
    const ch = api.subscribe(`session:${id}`, ['participants', 'alerts'], () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(reload, 1000);
    }, `session_id=eq.${id}`);
    const poll = setInterval(reload, 30_000); // rede ruim pode perder eventos do Realtime
    return () => {
      clearInterval(poll);
      clearTimeout(timer.current);
      void supabase.removeChannel(ch);
    };
  }, [id, reload]);

  return { session, participants, checkpoints, alerts, reload };
}
