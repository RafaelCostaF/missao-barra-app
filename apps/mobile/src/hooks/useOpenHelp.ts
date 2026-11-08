import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { api, logger, supabase } from '@/lib/services';

/** Atendimento aberto (ajuda/emergência) de uma pessoa no evento, e a ação de encerrar (participante ou organização). */
export function useOpenHelp(sessionId: string, userId: string, asOrg: boolean) {
  const [open, setOpen] = useState<'emergency' | 'help' | null>(null);
  const load = useCallback(() => api.alerts(sessionId).then((a) => {
    const mine = a.filter((x) => x.user_id === userId && !x.resolved_at && x.type !== 'signal_lost');
    setOpen(mine.some((x) => x.type === 'emergency') ? 'emergency' : mine.length ? 'help' : null);
  }).catch(() => undefined), [sessionId, userId]);
  useEffect(() => {
    if (!userId) return;
    void load();
    const ch = api.subscribe(`open-help:${sessionId}:${userId}`, ['alerts', 'help_messages'], () => void load(), `user_id=eq.${userId}`);
    return () => void supabase.removeChannel(ch);
  }, [sessionId, userId, load]);

  const close = () => Alert.alert(
    'Encerrar atendimento?',
    asOrg ? 'O pedido fica como resolvido e a pessoa vê o aviso na conversa.' : 'Use quando estiver tudo bem. Se precisar de novo, é só escrever aqui.',
    [{ text: 'Cancelar', style: 'cancel' }, {
      text: 'Encerrar', onPress: () => void logger.timed('help.close', () => api.closeHelp(sessionId, userId), { session_id: sessionId })
        .then(load).catch((e) => Alert.alert('Não foi possível encerrar', (e as Error).message)),
    }],
  );
  return { open, close };
}
