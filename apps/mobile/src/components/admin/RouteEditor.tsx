import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import type { Checkpoint, CheckpointKind } from '@mb/core';
import { Body, Button, Input } from '@/components/ui';
import { mapAvailable, SALVADOR } from '@/components/LiveMap';
import { act, Card, SmallButton } from './kit';
import { api } from '@/lib/services';
import { c, radius } from '@/theme';

type Draft = Omit<Checkpoint, 'id' | 'session_id'> & { kmText?: string };

/** Toque longo no mapa (ou "minha posição") adiciona ponto de apoio; largada e chegada = menor e maior km. */
export function RouteEditor({ sessionId, initial, onSaved }: { sessionId: string; initial: Checkpoint[]; onSaved: () => Promise<unknown> }) {
  const [cps, setCps] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- rascunho reiniciado quando o percurso salvo muda
  useEffect(() => setCps(initial.map(({ name, km, lat, lng, kind }) => ({ name, km, lat, lng, kind }))), [initial]);

  const update = (i: number, patch: Partial<Draft>) => setCps((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const add = (lat: number, lng: number) =>
    setCps((l) => [...l, { name: `Ponto ${l.length + 1}`, km: (l.at(-1)?.km ?? -5) + 5, lat, lng, kind: 'stop' }]);

  async function addHere() {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return Alert.alert('Localização negada', 'Permita a localização para marcar o ponto onde você está.');
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    add(pos.coords.latitude, pos.coords.longitude);
  }

  async function save() {
    if (cps.some((x) => !x.name.trim() || Number.isNaN(x.km))) return Alert.alert('Confira os pontos', 'Todo ponto precisa de nome e km.');
    const sorted = [...cps].sort((a, b) => a.km - b.km).map(({ kmText: _, ...x }, i, arr): Draft => ({
      ...x, name: x.name.trim(), kind: (i === 0 ? 'start' : i === arr.length - 1 ? 'finish' : 'stop') as CheckpointKind,
    }));
    setBusy(true);
    const ok = await act('admin.save_checkpoints', () => api.saveCheckpoints(sessionId, sorted), { count: sorted.length });
    if (ok !== undefined) await onSaved();
    setBusy(false);
    if (ok !== undefined) Alert.alert('Percurso salvo', `${sorted.length} ponto(s) de apoio.`);
  }

  const first = cps[0];
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={140} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: 12, paddingVertical: 12 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {mapAvailable ? (
          <View style={st.map}>
            <MapView style={{ flex: 1 }} onLongPress={(e) => add(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
              initialRegion={first ? { latitude: first.lat, longitude: first.lng, latitudeDelta: 0.12, longitudeDelta: 0.12 } : SALVADOR}>
              {cps.length > 1 && <Polyline coordinates={[...cps].sort((a, b) => a.km - b.km).map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={c.orange} strokeWidth={4} />}
              {cps.map((p, i) => (
                <Marker key={i} draggable coordinate={{ latitude: p.lat, longitude: p.lng }} title={p.name} description={`km ${p.km}`} pinColor={c.orangeDark}
                  onDragEnd={(e) => update(i, { lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })} />
              ))}
            </MapView>
          </View>
        ) : <Body muted small>Mapa indisponível neste aparelho: use “Minha posição” em cada ponto do percurso.</Body>}
        <Body muted small>Toque e segure no mapa para adicionar um ponto. Arraste o marcador para ajustar.</Body>
        <SmallButton icon="locate-outline" label="Adicionar minha posição" onPress={() => void addHere()} />

        <Card title={`Pontos de apoio (${cps.length})`}>
          {!cps.length && <Body muted small>Nenhum ponto ainda.</Body>}
          {cps.map((p, i) => (
            <View key={i} style={st.row}>
              <View style={{ flex: 2 }}><Input value={p.name} onChangeText={(v) => update(i, { name: v })} accessibilityLabel={`Nome do ponto ${i + 1}`} /></View>
              <View style={{ width: 76 }}>
                <Input value={p.kmText ?? String(p.km)} keyboardType="decimal-pad" accessibilityLabel={`km do ponto ${i + 1}`}
                  onChangeText={(v) => update(i, { kmText: v, km: Number(v.replace(',', '.')) })} />
              </View>
              <SmallButton icon="close" label="" a11y={`Remover ponto ${i + 1}`} onPress={() => setCps((l) => l.filter((_, j) => j !== i))} />
            </View>
          ))}
        </Card>
        <Button icon="save-outline" label="Salvar percurso" busy={busy} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  map: { height: 300, borderRadius: radius, overflow: 'hidden', borderWidth: 1, borderColor: c.line },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
});
