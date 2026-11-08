import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Body, Button, Empty, Row, Screen, Title } from '@/components/ui';
import { api, logger } from '@/lib/services';

type Item = Awaited<ReturnType<typeof api.mySessions>>[number];

export default function Races() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems((await api.mySessions()).filter((s: Item) => s.kind === 'private' && s.status !== 'archived'));
    } catch (e) {
      void logger.error('api.my_sessions', e);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  async function respond(id: string, accept: boolean) {
    await logger.timed('api.respond_invite', () => api.respondInvite(id, accept)).catch(() => undefined);
    void load();
  }

  return (
    <Screen>
      <Button icon="add" label="Criar corrida com amigos" onPress={() => router.push('/race/new')} />
      <FlatList
        data={items}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ gap: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={loading ? undefined : <Empty icon="people-outline" text="Nenhuma corrida ainda. Chame a galera!" />}
        renderItem={({ item, index }) => {
          const invited = item.participants[0]?.status === 'invited';
          return (
            <Row index={index} onPress={invited ? undefined : () => router.push(`/session/${item.id}`)}>
              <Title size={19}>{item.name}</Title>
              <Body muted>{invited ? 'Você foi convidado' : item.status === 'live' ? 'Em andamento' : item.status === 'ended' ? 'Encerrada' : 'Aguardando início'}</Body>
              {invited && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><Button label="Aceitar" onPress={() => respond(item.id, true)} /></View>
                  <View style={{ flex: 1 }}><Button variant="secondary" label="Recusar" onPress={() => respond(item.id, false)} /></View>
                </View>
              )}
            </Row>
          );
        }}
      />
    </Screen>
  );
}
