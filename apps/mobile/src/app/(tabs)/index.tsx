import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { profileMissing, type Session } from '@mb/core';
import { Body, Button, Empty, FadeIn, Row, Screen, SignalBadge, Title } from '@/components/ui';
import { BrandHero } from '@/components/BrandHero';
import { api, logger } from '@/lib/services';

const MY_LABEL: Record<string, string> = { tracking: 'Você está em percurso', finished: 'Você finalizou', accepted: 'Inscrito' };

export default function Events() {
  const [events, setEvents] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  // Minha situação em cada evento (o selo do evento não fala de mim).
  const [myStatus, setMyStatus] = useState<Map<string, string | undefined>>(new Map());
  const [missing, setMissing] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [evs, ct, mine] = await Promise.all([api.publishedEvents(), api.myContact(), api.mySessions().catch(() => [])]);
      setEvents(evs);
      setMyStatus(new Map((mine as { id: string; participants: { status: string }[] }[]).map((m) => [m.id, m.participants[0]?.status])));
      setMissing(profileMissing(ct));
    } catch (e) {
      void logger.error('api.events', e);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  return (
    <Screen top>
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ gap: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <BrandHero next={events.find((e) => e.status === 'live') ?? events[0]} />
            {missing.length > 0 && (
              <FadeIn>
                <Row onPress={() => router.push('/profile')}>
                  <Title size={15}>Complete seu cadastro</Title>
                  <Body muted small>Falta {missing.join(' e ')}. Sem isso não é possível iniciar o percurso.</Body>
                </Row>
              </FadeIn>
            )}
            {events.length > 0 && <Title size={15}>Eventos oficiais</Title>}
          </View>
        }
        ListEmptyComponent={loading ? undefined : <Empty icon="calendar-outline" text="Nenhum evento oficial publicado no momento." />}
        renderItem={({ item, index }) => (
          <Row index={index} onPress={() => router.push(`/session/${item.id}`)}>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {item.status === 'live' && <SignalBadge state="tracking" label="Ao vivo" />}
              {MY_LABEL[myStatus.get(item.id) ?? ''] && <SignalBadge state={myStatus.get(item.id) === 'tracking' ? 'tracking' : 'finished'} label={MY_LABEL[myStatus.get(item.id)!]} />}
            </View>
            <Title size={19}>{item.name}</Title>
            <Body muted>
              {item.starts_at ? new Date(item.starts_at).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' }) : 'Data a definir'}
            </Body>
            <Button icon="map-outline" label="Abrir percurso" onPress={() => router.push(`/session/${item.id}`)} />
          </Row>
        )}
      />
    </Screen>
  );
}
