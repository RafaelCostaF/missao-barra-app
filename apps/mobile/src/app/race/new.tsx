import { useCallback, useState } from 'react';
import { Alert, FlatList, Switch, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Body, Button, Input, Row, Screen } from '@/components/ui';
import { api, logger } from '@/lib/services';
import { useFriends } from '@/hooks/useFriends';
import { c } from '@/theme';

/** Corrida privada: só amigos aceitos podem ser convidados (o banco também garante). */
export default function NewRace() {
  const { friends, reload } = useFriends();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => void reload(), [reload]));

  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  async function create() {
    setBusy(true);
    try {
      const race = await logger.timed('api.create_race', () => api.createRace(name.trim() || 'Corrida entre amigos', [...picked]), { invited: picked.size });
      router.replace(`/session/${race.id}`);
    } catch (e) {
      Alert.alert('Não foi possível criar', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Input placeholder="Nome da corrida" value={name} onChangeText={setName} />
      <Body muted>Corrida privada: só quem você convidar e aceitar verá o mapa.</Body>
      <FlatList
        data={friends}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{ gap: 8 }}
        ListEmptyComponent={<Body muted>Adicione amigos na aba Amigos para convidá-los.</Body>}
        renderItem={({ item }) => (
          <Row onPress={() => toggle(item.id)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Body>{item.name}</Body>
              <Switch value={picked.has(item.id)} onValueChange={() => toggle(item.id)} trackColor={{ true: c.orangeDark }} />
            </View>
          </Row>
        )}
      />
      <Button label="Criar e convidar" onPress={create} busy={busy} />
    </Screen>
  );
}
