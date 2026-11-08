import { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker, Polyline, type MapMarker } from 'react-native-maps';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getSignalState, SIGNAL_LABEL, type Checkpoint, type LiveParticipant } from '@mb/core';
import { Body } from '@/components/ui';
import { c, font, radius, shadow, signalColor } from '@/theme';

/** Android sem chave do Google Maps derruba o app ao abrir o mapa. */
export const mapAvailable = Platform.OS !== 'android' || Boolean(Constants.expoConfig?.extra?.hasMapsKey);

export const SALVADOR = { latitude: -12.985, longitude: -38.44, latitudeDelta: 0.15, longitudeDelta: 0.2 };
const PAD = { top: 48, right: 48, bottom: 48, left: 48 };

/**
 * Mapa único para evento oficial e corrida privada. Participantes sem coordenada (não compartilham) não aparecem.
 * `focus` centraliza e abre o balão de uma pessoa; `highlight` destaca um grupo; tocar no balão chama `onSelect`.
 * Botão "Centralizar" volta à visão do percurso + participantes.
 */
export function LiveMap({ participants, checkpoints, now, focus, highlight, onSelect }: {
  participants: LiveParticipant[]; checkpoints: Checkpoint[]; now: number;
  focus?: string | null; highlight?: Set<string>; onSelect?: (userId: string) => void;
}) {
  const map = useRef<MapView>(null);
  const markers = useRef(new Map<string, MapMarker>());
  const fitted = useRef(false);
  const positioned = participants.filter((p) => p.last_lat != null && p.last_lng != null);
  const coords = [
    ...checkpoints.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    ...positioned.map((p) => ({ latitude: p.last_lat!, longitude: p.last_lng! })),
  ];

  const fit = (points = coords, animated = true) => {
    if (points.length > 1) map.current?.fitToCoordinates(points, { edgePadding: PAD, animated });
    else if (points.length === 1) map.current?.animateToRegion({ ...points[0], latitudeDelta: 0.01, longitudeDelta: 0.01 }, animated ? 400 : 0);
    else map.current?.animateToRegion(SALVADOR, animated ? 400 : 0);
  };

  // Primeira vez que há dados: enquadra percurso + pessoas.
  useEffect(() => {
    if (fitted.current || !coords.length) return;
    fitted.current = true;
    setTimeout(() => fit(coords, false), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords.length]);

  useEffect(() => {
    const p = focus ? positioned.find((x) => x.user_id === focus) : null;
    if (!p) return;
    map.current?.animateToRegion({ latitude: p.last_lat!, longitude: p.last_lng!, latitudeDelta: 0.008, longitudeDelta: 0.008 }, 500);
    setTimeout(() => markers.current.get(p.user_id)?.showCallout(), 550);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, positioned.length > 0]); // também quando as posições chegam depois (aberto com foco)

  // Só reenquadra quando o grupo muda (não a cada atualização da tela).
  const hlKey = highlight ? [...highlight].sort().join(',') : '';
  useEffect(() => {
    if (!highlight?.size) return;
    fit(positioned.filter((p) => highlight.has(p.user_id)).map((p) => ({ latitude: p.last_lat!, longitude: p.last_lng! })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hlKey]);

  if (!mapAvailable) return <ListFallback participants={participants} now={now} onSelect={onSelect} />;
  return (
    <View style={{ flex: 1, minHeight: 260 }}>
      <MapView ref={map} style={{ flex: 1 }} initialRegion={SALVADOR} showsUserLocation>
        {checkpoints.length > 1 && (
          <Polyline coordinates={checkpoints.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={c.orange} strokeWidth={4} />
        )}
        {checkpoints.map((p) => (
          <Marker key={p.id} coordinate={{ latitude: p.lat, longitude: p.lng }} title={p.name} description={`km ${p.km}`} pinColor={c.orangeDark} />
        ))}
        {positioned.map((p) => {
          const state = getSignalState(p as never, now);
          const dim = highlight?.size && !highlight.has(p.user_id) && focus !== p.user_id;
          return (
            <Marker
              key={p.user_id}
              ref={(m) => { if (m) markers.current.set(p.user_id, m); else markers.current.delete(p.user_id); }}
              coordinate={{ latitude: p.last_lat!, longitude: p.last_lng! }}
              title={p.display_name}
              description={`${SIGNAL_LABEL[state]} · ${(p.distance_m / 1000).toFixed(1)} km · ${p.last_at ? new Date(p.last_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}${onSelect ? ' · toque para abrir' : ''}`}
              pinColor={focus === p.user_id || highlight?.has(p.user_id) ? c.orange : signalColor[state]}
              opacity={dim ? 0.35 : state === 'stale' ? 0.6 : 1}
              onCalloutPress={onSelect ? () => onSelect(p.user_id) : undefined}
            />
          );
        })}
      </MapView>
      <Pressable onPress={() => fit()} style={st.recenter} accessibilityRole="button" accessibilityLabel="Centralizar mapa no percurso">
        <Ionicons name="locate" size={16} color={c.charcoal} />
        <Text style={st.recenterText}>Centralizar</Text>
      </Pressable>
    </View>
  );
}

function ListFallback({ participants, now, onSelect }: { participants: LiveParticipant[]; now: number; onSelect?: (userId: string) => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: c.sand, borderRadius: 4, padding: 12, gap: 6 }}>
      <Body muted>Mapa indisponível neste aparelho. Posições recentes:</Body>
      {participants.map((p) => {
        const state = getSignalState(p as never, now);
        return (
          <Pressable key={p.user_id} disabled={!onSelect} onPress={() => onSelect?.(p.user_id)}>
            <Body>
              <Body muted>{'● '}</Body>{p.display_name} · {SIGNAL_LABEL[state]}
              {p.last_lat != null ? ` · ${p.last_lat.toFixed(4)}, ${p.last_lng!.toFixed(4)}` : ''}
              {p.last_at ? ` · ${new Date(p.last_at).toLocaleTimeString('pt-BR')}` : ''}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  recenter: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.surface, borderRadius: radius, paddingHorizontal: 10, paddingVertical: 7, ...shadow },
  recenterText: { fontFamily: font.bold, fontSize: 12.5, color: c.charcoal },
});
