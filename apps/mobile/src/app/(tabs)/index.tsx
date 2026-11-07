import { useCallback, useState } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { Session } from '@mb/core';
import { Body, Button, Row, Screen, Title } from '@/components/ui';
import { api, logger } from '@/lib/services';

export default function Events() {
  const [events, setEvents] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await api.publishedEvents());
    } catch (e) {
      void logger.error('api.events', e);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  return (
    <Screen>
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ gap: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={<Body muted>Nenhum evento oficial publicado no momento.</Body>}
        renderItem={({ item }) => (
          <Row>
            <Title>{item.name}</Title>
            <Body muted>
              {item.starts_at ? new Date(item.starts_at).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' }) : 'Data a definir'}
              {item.status === 'live' ? ' · AO VIVO' : ''}
            </Body>
            <Button label="Abrir percurso" onPress={() => router.push(`/session/${item.id}`)} />
          </Row>
        )}
      />
    </Screen>
  );
}
