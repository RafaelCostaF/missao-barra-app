import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Ionicons from '@expo/vector-icons/Ionicons';
import { haversine, type Checkpoint, type Point } from '@mb/core';
import { mapAvailable, SALVADOR } from '@/components/LiveMap';
import { kmBR } from '@/lib/fmt';
import { c, font, shadow } from '@/theme';

/** race = segue você (padrão); overview = trajeto inteiro, só para ter noção; free = a pessoa mexeu no mapa. */
export type RunnerMode = 'race' | 'overview' | 'free';

const ll = (p: Point) => ({ latitude: p.lat, longitude: p.lng });
const ZOOM = 17; // como o "seguir minha localização" do Google Maps

/** Região que cobre o trajeto de ponta a ponta (a vista mais aberta que o app usa). */
function bounds(pts: Point[]) {
  if (pts.length < 2) return SALVADOR;
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  const [a, b, c2, d] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  return { latitude: (a + b) / 2, longitude: (c2 + d) / 2, latitudeDelta: Math.max(0.005, (b - a) * 1.25), longitudeDelta: Math.max(0.005, (d - c2) * 1.25) };
}

/** Ponto do caminho no meio de dois pontos de apoio (onde vai a etiqueta da distância). */
function midpoint(a: Point, b: Point, path: Point[] | null): Point {
  const m = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
  if (!path?.length) return m;
  let best = path[0], bd = Infinity;
  for (const p of path) {
    const d = haversine(p, m);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/**
 * Mapa em tela cheia de quem está correndo. Norte sempre para cima (o mapa não gira, como o Google Maps);
 * só o cone azul gira, mostrando para onde o celular aponta.
 */
export function RunnerMap({ path, checkpoints, target, ahead, aheadStraight, others, me, heading, mode, onMode, onDevice, insets }: {
  path: Point[] | null; checkpoints: Checkpoint[];
  target: Checkpoint | null;
  ahead: Point[]; aheadStraight: boolean;
  others: { id: string; name: string; lat: number; lng: number }[];
  /** Sua posição conhecida (servidor ou GPS do aparelho). */
  me: Point | null;
  heading: number | null;
  mode: RunnerMode; onMode: (m: RunnerMode) => void;
  onDevice: (p: Point) => void;
  insets: { top: number; bottom: number };
}) {
  const map = useRef<MapView>(null);
  const sent = useRef(0);
  const [puck, setPuck] = useState<Point | null>(null);
  const [labelsReady, setLabelsReady] = useState(false);
  const sorted = [...checkpoints].sort((a, b) => a.km - b.km);
  const line = path ?? sorted;
  const here = puck ?? me;
  const overview = mode === 'overview';

  const follow = (p: Point, duration = 500) =>
    map.current?.animateCamera({ center: ll(p), heading: 0, pitch: 0, zoom: ZOOM }, { duration });
  const showAll = () => {
    if (line.length > 1) map.current?.fitToCoordinates(line.map(ll), { edgePadding: { top: 40, bottom: insets.bottom + 24, left: 28, right: 88 }, animated: true });
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (mode === 'overview') showAll();
      else if (mode === 'race' && here) follow(here, 400);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, here != null, line.length > 1]);

  // Etiquetas personalizadas no Android precisam de um instante para desenhar antes de congelar.
  useEffect(() => {
    const t = setTimeout(() => setLabelsReady(true), 1500);
    return () => clearTimeout(t);
  }, []);

  if (!mapAvailable) return <View style={[StyleSheet.absoluteFill, { backgroundColor: c.sand }]} />;

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={bounds(line)}
        mapPadding={overview ? { top: 0, bottom: insets.bottom, left: 0, right: 0 } : { top: insets.top, bottom: insets.bottom, left: 0, right: 0 }}
        rotateEnabled={false} pitchEnabled={false} showsCompass={false} showsMyLocationButton={false} toolbarEnabled={false}
        showsPointsOfInterests={false} showsUserLocation={!overview}
        onPanDrag={() => mode === 'race' && onMode('free')}
        onUserLocationChange={(e) => {
          const u = e.nativeEvent.coordinate;
          if (!u) return;
          const p = { lat: u.latitude, lng: u.longitude };
          setPuck(p);
          if (mode === 'race') follow(p);
          if (Date.now() - sent.current > 4000) {
            sent.current = Date.now();
            onDevice(p);
          }
        }}>
        {overview ? (
          // Visão geral: trajeto, pontos numerados, distância entre eles e participantes. Nada mais.
          <>
            {line.length > 1 && <Polyline coordinates={line.map(ll)} strokeColor={c.orangeDark} strokeWidth={5} />}
            {sorted.slice(1).map((b, i) => {
              const a = sorted[i];
              return (
                <Marker key={`d-${b.id}`} coordinate={ll(midpoint(a, b, path))} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={!labelsReady} tappable={false} zIndex={2}>
                  <View style={st.dist}><Text style={st.distText}>{kmBR((b.km - a.km) * 1000)} km</Text></View>
                </Marker>
              );
            })}
            {sorted.map((p, i) => (
              <Marker key={`o-${p.id}`} coordinate={ll(p)} title={p.name} description={`km ${kmBR(p.km * 1000)}`} anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={!labelsReady} zIndex={3}>
                <View style={[st.num, i === sorted.length - 1 && { backgroundColor: c.orangeDark }]}>
                  <Text style={st.numText}>{i === sorted.length - 1 ? 'FIM' : i + 1}</Text>
                </View>
              </Marker>
            ))}
            {me && (
              <Marker key="me" coordinate={ll(me)} title="Você" anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={!labelsReady} zIndex={5}>
                <View style={st.meDot} />
              </Marker>
            )}
          </>
        ) : (
          // Modo corrida: trajeto discreto, caminho à frente destacado (com borda branca), ponto de destino em evidência.
          <>
            {line.length > 1 && <Polyline coordinates={line.map(ll)} strokeColor="rgba(29,30,34,0.28)" strokeWidth={5} />}
            {ahead.length > 1 && <Polyline coordinates={ahead.map(ll)} strokeColor={c.white} strokeWidth={11} lineDashPattern={aheadStraight ? [10, 8] : undefined} />}
            {ahead.length > 1 && <Polyline coordinates={ahead.map(ll)} strokeColor={c.orangeDark} strokeWidth={7} lineDashPattern={aheadStraight ? [10, 8] : undefined} />}
            {sorted.map((p) => {
              const isTarget = target?.id === p.id;
              return (
                <Marker key={`r-${p.id}-${isTarget}`} coordinate={ll(p)} title={p.name} description={`km ${kmBR(p.km * 1000)}`} anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={!labelsReady} zIndex={isTarget ? 3 : 1}>
                  <View style={[st.cp, isTarget && st.cpTarget]} />
                </Marker>
              );
            })}
            {/* Para onde o celular aponta (o mapa fica parado, o cone gira). */}
            {here && heading != null && (
              <Marker coordinate={ll(here)} anchor={{ x: 0.5, y: 0.5 }} zIndex={0} tappable={false}>
                <View style={[st.coneBox, { transform: [{ rotate: `${heading}deg` }] }]} pointerEvents="none">
                  <View style={st.cone} />
                </View>
              </Marker>
            )}
          </>
        )}
        {others.map((o) => (
          <Marker key={`p-${o.id}`} coordinate={ll(o)} title={o.name} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={!labelsReady} zIndex={4}>
            <View style={st.other} />
          </Marker>
        ))}
      </MapView>

      <View style={[st.modes, { top: 12 }]}>
        <ModeButton icon="navigate" label="Corrida" active={!overview} onPress={() => (mode === 'race' && here ? follow(here) : onMode('race'))} />
        <ModeButton icon="map-outline" label="Percurso" active={overview} onPress={() => (overview ? showAll() : onMode('overview'))} />
      </View>
      {mode === 'free' && here && (
        <Pressable onPress={() => onMode('race')} style={[st.resume, { bottom: insets.bottom + 12 }]} accessibilityRole="button" accessibilityLabel="Voltar a seguir minha posição">
          <Ionicons name="locate" size={16} color={c.white} />
          <Text style={st.resumeText}>Centralizar em mim</Text>
        </Pressable>
      )}
    </View>
  );
}

function ModeButton({ icon, label, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }}
      style={({ pressed }) => [st.mode, active && st.modeOn, pressed && { opacity: 0.85 }]}>
      <Ionicons name={icon} size={20} color={active ? c.white : c.charcoal} />
      <Text style={[st.modeText, active && { color: c.white }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  modes: { position: 'absolute', right: 12, gap: 8 },
  mode: { width: 64, height: 58, borderRadius: 14, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', gap: 2, ...shadow, shadowOpacity: 0.18 },
  modeOn: { backgroundColor: c.orangeDark },
  modeText: { fontFamily: font.bold, fontSize: 10.5, color: c.charcoal },
  resume: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.charcoal, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, ...shadow },
  resumeText: { fontFamily: font.bold, fontSize: 13, color: c.white },
  cp: { width: 14, height: 14, borderRadius: 7, backgroundColor: c.white, borderWidth: 3, borderColor: c.orangeDark },
  cpTarget: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.orangeDark, borderColor: c.white },
  num: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 5, backgroundColor: c.charcoal, borderWidth: 2, borderColor: c.white, alignItems: 'center', justifyContent: 'center' },
  numText: { fontFamily: font.bold, fontSize: 11, color: c.white },
  dist: { backgroundColor: c.white, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: c.line },
  distText: { fontFamily: font.bold, fontSize: 11, color: c.orangeDark },
  other: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.ok, borderWidth: 2, borderColor: c.white },
  meDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#1A73E8', borderWidth: 3, borderColor: c.white },
  coneBox: { width: 100, height: 100, alignItems: 'center' },
  cone: { width: 0, height: 0, borderLeftWidth: 26, borderRightWidth: 26, borderTopWidth: 50, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: 'rgba(26,115,232,0.30)' },
});
