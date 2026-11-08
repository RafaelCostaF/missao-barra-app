import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  averagePaceS, fmtClock, fmtPace, getSignalState, pathAhead, routeStatus,
  type Checkpoint, type LiveParticipant, type Point, type RouteLine,
} from '@mb/core';
import { RunnerMap, type RunnerMode } from '@/components/RunnerMap';
import { useHeading } from '@/hooks/useHeading';
import { useStartedAt } from '@/hooks/useStartedAt';
import { useStreetApproach, useStreetPath } from '@/hooks/useStreetPath';
import { about, kmBR } from '@/lib/fmt';
import { tracker } from '@/lib/services';
import { c, font, shadow } from '@/theme';

const dist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${kmBR(m, m < 10_000 ? 1 : 0)} km`);
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

/**
 * Tela de quem está correndo: mapa em tela cheia + o essencial por cima, sem frases longas.
 * Em cima: para onde ir (próximo ponto, distância, tempo). Embaixo: pace, distância, tempo.
 */
export function RunnerView({ sessionId, me, participants, checkpoints, now, route, notices }: {
  sessionId: string; me: LiveParticipant; participants: LiveParticipant[]; checkpoints: Checkpoint[]; now: number;
  route: RouteLine | null | undefined;
  /** Avisos curtos (ex.: "Ana pediu ajuda"). */
  notices: string[];
}) {
  const { start } = useStartedAt(sessionId, me.user_id, me.status);
  const live = tracker.stats.snapshot(now);
  const path = useStreetPath(route, checkpoints);
  const heading = useHeading();
  const [device, setDevice] = useState<Point | null>(null);
  const [mode, setMode] = useState<RunnerMode>('race');
  const [top, setTop] = useState(110);
  const [bottom, setBottom] = useState(90);

  const server = me.last_lat != null ? { lat: me.last_lat, lng: me.last_lng! } : null;
  const pos = device ?? server; // GPS do aparelho é mais atual que o último envio
  const elapsedS = start ? (now - Date.parse(start)) / 1000 : live.movingS;
  const avgPace = averagePaceS(start, me.distance_m, now);
  const paceForEta = live.currentPaceS ?? live.movingPaceS ?? avgPace;
  const pace = live.currentPaceS ?? avgPace;
  const where = routeStatus(pos, checkpoints, paceForEta, now, path);
  const { next, finish } = where;
  const sorted = [...checkpoints].sort((a, b) => a.km - b.km);
  const target = next ? sorted.find((cp) => cp.name === next.name && cp.km === next.km) ?? null : null;
  // Fora do percurso: caminho pelas ruas até o ponto mais perto (linha tracejada só se o serviço falhar).
  const approach = useStreetApproach(!where.onRoute ? pos : null, !where.onRoute ? target : null);
  const ahead = !pos ? [] : where.onRoute
    ? (path && where.along != null ? pathAhead(path, where.along) : [pos, ...sorted.filter((cp) => cp.km > where.kmNow!)])
    : approach ?? (target ? [pos, target] : []);
  const others = participants
    .filter((p) => p.user_id !== me.user_id && p.last_lat != null && getSignalState(p as never, now) === 'tracking')
    .map((p) => ({ id: p.user_id, name: p.display_name, lat: p.last_lat!, lng: p.last_lng! }));

  return (
    <View style={{ flex: 1 }}>
      <RunnerMap path={path} checkpoints={checkpoints} target={target} ahead={ahead} aheadStraight={!where.onRoute && !approach}
        others={others} start={server} heading={heading} mode={mode} onMode={setMode} onDevice={setDevice} insets={{ top, bottom }} />

      {/* Para onde ir agora. */}
      <View style={st.topWrap} pointerEvents="box-none" onLayout={(e) => setTop(e.nativeEvent.layout.height)}>
        <View style={st.banner}>
          <View style={st.bannerIcon}>
            <Ionicons name={!next ? 'locate' : where.onRoute ? 'flag' : 'return-up-forward'} size={24} color={c.white} />
          </View>
          <View style={{ flex: 1 }}>
            {next ? (
              <>
                {!where.onRoute && <Text style={st.kicker}>Fora do percurso · vá até</Text>}
                <Text style={st.bannerTitle} numberOfLines={1}>{next.name}</Text>
                <Text style={st.bannerSub} numberOfLines={1}>
                  {dist(next.remainingM)}{next.etaS != null ? ` · ${next.etaS < 60 ? '<1 min' : about(next.etaS)}` : ''}
                </Text>
              </>
            ) : (
              <>
                <Text style={st.bannerTitle}>Procurando GPS…</Text>
                <Text style={st.bannerSub}>Fique em local aberto</Text>
              </>
            )}
          </View>
          {target && (
            // Navegação a pé no Google Maps até o ponto (grátis, abre o app se estiver instalado).
            <Pressable hitSlop={8} accessibilityRole="link" accessibilityLabel={`Abrir rota a pé até ${target.name} no Google Maps`}
              onPress={() => void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=walking`)}
              style={({ pressed }) => [st.gmaps, pressed && { opacity: 0.8 }]}>
              <Ionicons name="logo-google" size={16} color={c.charcoal} />
              <Text style={st.gmapsText}>Maps</Text>
            </Pressable>
          )}
        </View>
        {finish && finish.name !== next?.name && (
          <View style={st.finish}>
            <Ionicons name="trophy" size={13} color={c.orangeLight} />
            <Text style={st.finishText} numberOfLines={1}>
              Chegada {dist(finish.remainingM)}{finish.etaS != null ? ` · ${about(finish.etaS)} · ${hhmm(finish.at)}` : ''}
            </Text>
          </View>
        )}
        {notices.map((n) => (
          <View key={n} style={st.notice}>
            <Ionicons name="alert-circle" size={14} color={c.white} />
            <Text style={st.noticeText} numberOfLines={1}>{n}</Text>
          </View>
        ))}
      </View>

      {/* O essencial do corredor, em números. */}
      <View style={st.metrics} onLayout={(e) => setBottom(e.nativeEvent.layout.height + 16)}>
        <Metric label={live.currentPaceS ? 'Pace' : 'Pace médio'} value={fmtPace(pace)} unit="/km" />
        <View style={st.sep} />
        <Metric label="Distância" value={kmBR(me.distance_m, me.distance_m < 10_000 ? 2 : 1)} unit="km" />
        <View style={st.sep} />
        <Metric label="Tempo" value={fmtClock(elapsedS)} />
      </View>
    </View>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }} accessible accessibilityLabel={`${label}: ${value} ${unit ?? ''}`}>
      <Text style={st.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}{unit && value !== '—' ? <Text style={st.unit}> {unit}</Text> : null}
      </Text>
      <Text style={st.label}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  topWrap: { position: 'absolute', top: 0, left: 0, right: 88, padding: 12, paddingRight: 0, gap: 6 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.charcoal, borderRadius: 16, padding: 12, ...shadow, shadowOpacity: 0.25 },
  bannerIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.orangeDark, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: font.bold, fontSize: 11, color: c.orangeLight, textTransform: 'uppercase', letterSpacing: 0.6 },
  bannerTitle: { fontFamily: font.display, fontSize: 20, color: c.white },
  bannerSub: { fontFamily: font.bold, fontSize: 15, color: c.sand },
  gmaps: { alignItems: 'center', justifyContent: 'center', gap: 1, backgroundColor: c.white, borderRadius: 10, width: 48, height: 44 },
  gmapsText: { fontFamily: font.bold, fontSize: 10, color: c.charcoal },
  finish: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(29,30,34,0.85)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  finishText: { fontFamily: font.bold, fontSize: 12, color: c.white, flexShrink: 1 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: c.danger, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  noticeText: { fontFamily: font.bold, fontSize: 12, color: c.white, flexShrink: 1 },
  metrics: { position: 'absolute', left: 12, right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 6, ...shadow, shadowOpacity: 0.2 },
  sep: { width: 1, alignSelf: 'stretch', backgroundColor: c.line, marginVertical: 4 },
  value: { fontFamily: font.display, fontSize: 24, color: c.charcoal },
  unit: { fontFamily: font.bold, fontSize: 12, color: c.inkSoft },
  label: { fontFamily: font.bold, fontSize: 10.5, color: c.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 },
});
