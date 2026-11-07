import { useCallback, useState } from 'react';
import { api, logger } from '@/lib/services';

export interface Person { id: string; name: string }

/** Separa amizades em aceitas, recebidas e enviadas, do ponto de vista do usuário logado. */
export function useFriends() {
  const [state, setState] = useState({ me: '', friends: [] as Person[], incoming: [] as Person[], outgoing: [] as Person[] });

  const reload = useCallback(async () => {
    try {
      const [me, rows] = await Promise.all([api.me(), api.friendships()]);
      const next = { me, friends: [] as Person[], incoming: [] as Person[], outgoing: [] as Person[] };
      for (const r of rows as any[]) {
        const mine = r.requester === me;
        const other: Person = mine ? { id: r.addressee, name: r.adr.display_name } : { id: r.requester, name: r.req.display_name };
        if (r.status === 'accepted') next.friends.push(other);
        else if (r.status === 'pending') (mine ? next.outgoing : next.incoming).push(other);
      }
      setState(next);
    } catch (e) {
      void logger.error('api.friendships', e);
    }
  }, []);

  return { ...state, reload };
}
