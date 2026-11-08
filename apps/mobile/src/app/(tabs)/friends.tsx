import { useCallback, useState } from 'react';
import { stravaLink, type StravaAccount } from '@mb/core';
import { StravaButton } from '@/components/Strava';
import { FlatList, Linking, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Body, Button, Empty, Input, Row, Screen, Title } from '@/components/ui';
import { api, logger } from '@/lib/services';
import { useFriends, type Person } from '@/hooks/useFriends';

export default function Friends() {
  const { me, friends, incoming, outgoing, reload } = useFriends();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  // Perfis Strava que amigos escolheram mostrar (o banco só devolve amigos aceitos com consentimento).
  const [strava, setStrava] = useState<Map<string, Pick<StravaAccount, 'athlete_id' | 'athlete_name' | 'profile_url'>>>(new Map());
  useFocusEffect(useCallback(() => {
    void reload();
    void api.friendsStrava().then((rows) => setStrava(new Map(rows.map((r) => [r.user_id, r])))).catch(() => undefined);
  }, [reload]));

  const known = new Set([...friends, ...incoming, ...outgoing].map((f) => f.id));
  const run = (name: string, fn: () => Promise<unknown>) => logger.timed(name, fn).catch(() => undefined).then(reload);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Input style={{ flex: 1, minWidth: 0 }} placeholder="Buscar pelo nome" value={q} onChangeText={setQ} />
        <Button icon="search" label="Buscar" onPress={async () => setResults(q.trim().length >= 2 ? (await api.searchPeople(q.trim())).map((p) => ({ id: p.id, name: p.display_name })) : [])} />
      </View>
      <FlatList
        data={[
          ...incoming.map((p) => ({ ...p, kind: 'incoming' as const })),
          ...results.filter((r) => !known.has(r.id) && r.id !== me).map((p) => ({ ...p, kind: 'result' as const })),
          ...outgoing.map((p) => ({ ...p, kind: 'outgoing' as const })),
          ...friends.map((p) => ({ ...p, kind: 'friend' as const })),
        ]}
        keyExtractor={(p) => `${p.kind}:${p.id}`}
        contentContainerStyle={{ gap: 8 }}
        ListEmptyComponent={<Empty icon="search-outline" text="Busque amigos pelo nome para convidá-los às corridas. Quem conectar o Strava e liberar no Perfil aparece com o botão Ver no Strava." />}
        renderItem={({ item, index }) => (
          <Row index={index}>
            <Title size={17}>{item.name}</Title>
            {item.kind === 'friend' && <Body muted>Amigo</Body>}
            {item.kind === 'friend' && strava.has(item.id) && stravaLink(strava.get(item.id)!) && (
              <StravaButton label="Ver no Strava" onPress={() => void Linking.openURL(stravaLink(strava.get(item.id)!)!)} />
            )}
            {item.kind === 'outgoing' && <Body muted>Solicitação enviada</Body>}
            {item.kind === 'result' && <Button label="Adicionar" onPress={() => run('api.request_friend', () => api.requestFriend(item.id))} />}
            {item.kind === 'incoming' && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Button label="Aceitar" onPress={() => run('api.respond_friend', () => api.respondFriend(item.id, true))} /></View>
                <View style={{ flex: 1 }}><Button variant="secondary" label="Recusar" onPress={() => run('api.respond_friend', () => api.respondFriend(item.id, false))} /></View>
              </View>
            )}
          </Row>
        )}
      />
    </Screen>
  );
}
