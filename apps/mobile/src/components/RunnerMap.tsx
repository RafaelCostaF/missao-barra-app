import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Checkpoint, Point } from '@mb/core';
import { mapAvailable, SALVADOR } from '@/components/LiveMap';
import { c, font, shadow } from '@/theme';

export type RunnerMode = 'race' | 'overview' | 'free';

const ll = (p: Point) => ({ latitude: p.lat, longitude: p.lng });

/**
 * Mapa em tela cheia de quem está correndo, como navegação do Maps.
 * - Corrida: câmera atrás da pessoa, inclinada (3D), girando para onde ela anda/aponta o celular.
 * - Percurso: visão de cima com o trajeto inteiro.
 * O cone azul mostra para onde o celular aponta. `insets` = espaço ocupado pelos painéis por cima.
 */
export function RunnerMap({ path, checkpoints, target, ahead, aheadStraight, others, start, heading, mode, onMode, onDevice, insets }: {
  path: Point[] | null; checkpoints: Checkpoint[];
  /** Ponto de apoio para onde a pessoa vai agora (destacado). */
  target: Checkpoint | null;
  /** Caminho a seguir a partir da posição atual. */
  ahead: Point[]; aheadStraight: boolean;
  /** Outros participantes com sinal recente. */
  others: { id: string; name: string; lat: number; lng: number }[];
  /** Posição conhecida pelo servidor (até o GPS do aparelho responder). */
  start: Point | null;
  /** Bússola (graus). */
  heading: number | null;
  mode: RunnerMode; onMode: (m: RunnerMode) => void;
  onDevice: (p: Point) => void;
  insets: { top: number; bottom: number };
}) {
  const map = useRef<MapView>(null);
  const course = useRef<number | null>(null);
  const sent = useRef({ t: 0, p: null as Point | null });
  const [puck, setPuck] = useState<Point | null>(null);
  const [camHeading, setCamHeading] = useState(0);
  const line = path ?? [...checkpoints].sort((a, b) => a.km - b.km);
  const here = puck ?? start;

  /** Andando: direção do movimento. Parado: para onde o celular aponta. */
  const bearing = () => course.current ?? heading ?? camHeading;
  const follow = (p: Point, duration = 500) => {
    const h = bearing();
    map.current?.animateCamera({ center: ll(p), heading: h, pitch: 60, zoom: 18 }, { duration });
    setCamHeading(h);
  };
  const overview = () => {
    const pts = [...line, ...(here ? [here] : [])].map(ll);
    map.current?.setCamera({ heading: 0, pitch: 0 });
    setCamHeading(0);
    setTimeout(() => {
      if (pts.length > 1) map.current?.fitToCoordinates(pts, { edgePadding: { top: insets.top + 24, bottom: insets.bottom + 24, left: 32, right: 80 }, animated: true });
    }, 50);
  };

  useEffect(() => {
    // Depois do render (o mapa precisa existir e o enquadramento usa as margens já medidas).
    const t = setTimeout(() => {
      if (mode === 'overview') overview();
      else if (mode === 'race' && here) follow(here, 400);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, here != null]);

  // Parado no modo corrida, o mapa gira junto com o celular (como o Maps).
  useEffect(() => {
    if (mode !== 'race' || !here || heading == null) return;
    const t = setTimeout(() => course.current == null && follow(here, 250), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heading]);

  if (!mapAvailable) return <View style={[StyleSheet.absoluteFill, { backgroundColor: c.sand }]} />;

  const coneRot = heading == null ? null : heading - camHeading;
  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={SALVADOR}
        mapPadding={{ top: insets.top, bottom: insets.bottom, left: 0, right: 0 }}
        showsUserLocation showsMyLocationButton={false} showsCompass={false} showsBuildings showsPointsOfInterests={false}
        toolbarEnabled={false} pitchEnabled rotateEnabled
        onPanDrag={() => mode !== 'free' && onMode('free')}
        onRegionChangeComplete={() => {
          if (mode === 'free') void map.current?.getCamera().then((cam) => setCamHeading(cam.heading)).catch(() => undefined);
        }}
        onUserLocationChange={(e) => {
          const u = e.nativeEvent.coordinate;
          if (!u) return;
          const p = { lat: u.latitude, lng: u.longitude };
          course.current = u.heading != null && u.heading >= 0 && (u.speed ?? 0) > 1.2 ? u.heading : null;
          setPuck(p);
          if (mode === 'race') follow(p);
          // Avisa a tela no máximo a cada 4 s (recalcula próximo ponto/estimativas).
          const now = Date.now();
          if (now - sent.current.t > 4000) {
            sent.current = { t: now, p };
            onDevice(p);
          }
        }}>
        {/* Trajeto inteiro, discreto; o caminho à frente por cima, com borda branca como no Maps. */}
        {line.length > 1 && <Polyline coordinates={line.map(ll)} strokeColor="rgba(29,30,34,0.28)" strokeWidth={5} />}
        {ahead.length > 1 && (
          <>
            <Polyline coordinates={ahead.map(ll)} strokeColor={c.white} strokeWidth={11} lineDashPattern={aheadStraight ? [10, 8] : undefined} />
            <Polyline coordinates={ahead.map(ll)} strokeColor={c.orangeDark} strokeWidth={7} lineDashPattern={aheadStraight ? [10, 8] : undefined} />
          </>
        )}
        {checkpoints.map((p) => {
          const isTarget = target?.id === p.id;
          return (
            <Marker key={`${p.id}-${isTarget}`} coordinate={ll(p)} title={p.name} description={`km ${p.km}`} anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false} zIndex={isTarget ? 3 : 1}>
              <View style={[st.cp, isTarget && st.cpTarget]} />
            </Marker>
          );
        })}
        {others.map((o) => (
          <Marker key={o.id} coordinate={ll(o)} title={o.name} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={2}>
            <View style={st.other} />
          </Marker>
        ))}
        {/* Para onde o celular aponta: cone azul saindo do ponto azul da sua posição. */}
        {here && coneRot != null && (
          <Marker coordinate={ll(here)} anchor={{ x: 0.5, y: 0.5 }} zIndex={0} tappable={false}>
            <View style={[st.coneBox, { transform: [{ rotate: `${coneRot}deg` }] }]} pointerEvents="none">
              <View style={st.cone} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Dois modos: Corrida (segue você, 3D) e Percurso (trajeto todo). */}
      <View style={[st.modes, { top: 12 }]}>
        <ModeButton icon="navigate" label="Corrida" active={mode === 'race'} onPress={() => (mode === 'race' && here ? follow(here) : onMode('race'))} />
        <ModeButton icon="map-outline" label="Percurso" active={mode === 'overview'} onPress={() => (mode === 'overview' ? overview() : onMode('overview'))} />
      </View>
      {mode === 'free' && here && (
        <Pressable onPress={() => onMode('race')} style={[st.resume, { bottom: insets.bottom + 12 }]} accessibilityRole="button" accessibilityLabel="Voltar a seguir minha posição">
          <Ionicons name="navigate" size={16} color={c.white} />
          <Text style={st.resumeText}>Centralizar</Text>
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

const BLUE = 'rgba(26,115,232,0.30)';
const st = StyleSheet.create({
  modes: { position: 'absolute', right: 12, gap: 8 },
  mode: { width: 64, height: 58, borderRadius: 14, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', gap: 2, ...shadow, shadowOpacity: 0.18 },
  modeOn: { backgroundColor: c.orangeDark },
  modeText: { fontFamily: font.bold, fontSize: 10.5, color: c.charcoal },
  resume: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.charcoal, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, ...shadow },
  resumeText: { fontFamily: font.bold, fontSize: 13, color: c.white },
  cp: { width: 14, height: 14, borderRadius: 7, backgroundColor: c.white, borderWidth: 3, borderColor: c.orangeDark },
  cpTarget: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.orangeDark, borderColor: c.white },
  other: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.ok, borderWidth: 2, borderColor: c.white },
  // Triângulo com a ponta no centro da caixa (a sua posição), abrindo para a direção apontada.
  coneBox: { width: 100, height: 100, alignItems: 'center' },
  cone: { width: 0, height: 0, borderLeftWidth: 26, borderRightWidth: 26, borderTopWidth: 50, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: BLUE },
});
