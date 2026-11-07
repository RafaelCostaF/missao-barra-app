import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { toNotice } from '@mb/core';
import { api, supabase } from '@/lib/services';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Convites, amizades e alertas viram notificações locais (sem servidor de push no MVP). */
export function useNotices(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    void Notifications.requestPermissionsAsync();
    const names = new Map<string, string>();
    const ch = api.subscribe(`notices:${userId}`, ['friendships', 'participants', 'alerts'], async (change) => {
      const ids = [change.new.requester, change.new.addressee, change.new.user_id].filter(Boolean);
      const missing = ids.filter((i) => !names.has(i));
      if (missing.length) {
        const { data } = await supabase.from('profiles').select('id, display_name').in('id', missing);
        data?.forEach((p) => names.set(p.id, p.display_name));
      }
      const notice = toNotice(change, userId, (id) => names.get(id) ?? 'Alguém');
      if (notice) await Notifications.scheduleNotificationAsync({ content: { title: notice.title, body: notice.body }, trigger: null });
    });
    return () => void supabase.removeChannel(ch);
  }, [userId]);
}
