import { Platform, View } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { getSignalState, SIGNAL_LABEL, type Checkpoint, type LiveParticipant } from '@mb/core';
import { Body } from '@/components/ui';
import { c, signalColor } from '@/theme';

/** Android sem chave do Google Maps derruba o app ao abrir o mapa. */
export const mapAvailable = Platform.OS !== 'android' || Boolean(Constants.expoConfig?.extra?.hasMapsKey);

export const SALVADOR = { latitude: -12.985, longitude: -38.44, latitudeDelta: 0.15, longitudeDelta: 0.2 };

/** Mapa único para evento oficial e corrida privada. Participantes sem coordenada (não compartilham) não aparecem. */
export function LiveMap({ participants, checkpoints, now }: { participants: LiveParticipant[]; checkpoints: Checkpoint[]; now: number }) {
  if (!mapAvailable) return <ListFallback participants={participants} now={now} />;
  return (
    <MapView style={{ flex: 1, minHeight: 260 }} initialRegion={SALVADOR} showsUserLocation>
      {checkpoints.length > 1 && (
        <Polyline coordinates={checkpoints.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={c.orange} strokeWidth={4} />
      )}
      {checkpoints.map((p) => (
        <Marker key={p.id} coordinate={{ latitude: p.lat, longitude: p.lng }} title={p.name} description={`km ${p.km}`} pinColor={c.orangeDark} />
      ))}
      {participants.filter((p) => p.last_lat != null && p.last_lng != null).map((p) => {
        const state = getSignalState(p as never, now);
        return (
          <Marker
            key={p.user_id}
            coordinate={{ latitude: p.last_lat!, longitude: p.last_lng! }}
            title={p.display_name}
            description={`Última atualização: ${p.last_at ? new Date(p.last_at).toLocaleTimeString('pt-BR') : '—'}`}
            pinColor={signalColor[state]}
            opacity={state === 'stale' ? 0.6 : 1}
          />
        );
      })}
    </MapView>
  );
}

function ListFallback({ participants, now }: { participants: LiveParticipant[]; now: number }) {
  return (
    <View style={{ flex: 1, backgroundColor: c.sand, borderRadius: 4, padding: 12, gap: 6 }}>
      <Body muted>Mapa indisponível neste aparelho. Posições recentes:</Body>
      {participants.map((p) => {
        const state = getSignalState(p as never, now);
        return (
          <Body key={p.user_id}>
            <Body muted>{'● '}</Body>{p.display_name} · {SIGNAL_LABEL[state]}
            {p.last_lat != null ? ` · ${p.last_lat.toFixed(4)}, ${p.last_lng!.toFixed(4)}` : ''}
            {p.last_at ? ` · ${new Date(p.last_at).toLocaleTimeString('pt-BR')}` : ''}
          </Body>
        );
      })}
    </View>
  );
}
