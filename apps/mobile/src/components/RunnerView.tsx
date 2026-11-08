import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  averagePaceS, fmtClock, fmtPace, getSignalState, pathAhead, routeStatus,
  type Checkpoint, type LiveParticipant, type Point, type RouteLine,
} from '@mb/core';
import { RunnerMap, type RunnerMode } from '@/components/RunnerMap';
import { useHeading } from '@/hooks/useHeading';
import { useStartedAt } from '@/hooks/useStartedAt';
import { useStreetApproach, useStreetPath } from '@/hooks/useStreetPath';
import { about, dur, kmBR } from '@/lib/fmt';
import { tracker } from '@/lib/services';
import { c, font, shadow } from '@/theme';

const dist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${kmBR(m, m < 10_000 ? 1 : 0)} km`);
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
const eta = (s: number | null) => (s == null ? '' : s < 60 ? '<1 min' : about(s));

/**
 * Tela de quem está correndo: mapa em tela cheia.
 * Modo corrida (padrão): próximo ponto em cima; embaixo pace/distância/tempo, com "Mais dados" para o resto.
 * Modo percurso: só o mapa (trajeto, pontos, distâncias e participantes).
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
  const [more, setMore] = useState(false);
  const [top, setTop] = useState(90);
  const [bottom, setBottom] = useState(100);
  const overview = mode === 'overview';

  const server = me.last_lat != null ? { lat: me.last_lat, lng: me.last_lng! } : null;
  const pos = device ?? server; // GPS do aparelho é mais atual que o último envio
  const elapsedS = start ? (now - Date.parse(start)) / 1000 : live.movingS;
  const avgPace = averagePaceS(start, me.distance_m, now);
  const paceForEta = live.currentPaceS ?? live.movingPaceS ?? avgPace;
  const where = routeStatus(pos, checkpoints, paceForEta, now, path);
  const { next, finish } = where;
  const sorted = [...checkpoints].sort((a, b) => a.km - b.km);
  const target = next ? sorted.find((cp) => cp.name === next.name && cp.km === next.km) ?? null : null;
  // Fora do percurso: caminho pelas ruas até o ponto mais perto (tracejado só se o serviço falhar).
  const approach = useStreetApproach(!where.onRoute ? pos : null, !where.onRoute ? target : null);
  const ahead = !pos ? [] : where.onRoute
    ? (path && where.along != null ? pathAhead(path, where.along) : [pos, ...sorted.filter((cp) => cp.km > where.kmNow!)])
    : approach ?? (target ? [pos, target] : []);
  const others = participants
    .filter((p) => p.user_id !== me.user_id && p.last_lat != null && getSignalState(p as never, now) === 'tracking')
    .map((p) => ({ id: p.user_id, name: p.display_name, lat: p.last_lat!, lng: p.last_lng! }));
  const speed = live.speedKmh ? live.speedKmh.toFixed(1).replace('.', ',') : '—';

  return (
    <View style={{ flex: 1 }}>
      <RunnerMap path={path} checkpoints={checkpoints} target={target} ahead={ahead} aheadStraight={!where.onRoute && !approach}
        others={others} me={pos} heading={heading} mode={mode} onMode={setMode} onDevice={setDevice}
        insets={{ top: overview ? 0 : top, bottom: overview ? 0 : bottom }} />

      {!overview && (
        <>
          {/* Para onde ir agora. */}
          <View style={st.topWrap} pointerEvents="box-none" onLayout={(e) => setTop(e.nativeEvent.layout.height)}>
            <View style={st.banner}>
              <View style={[st.bannerIcon, !where.onRoute && next && { backgroundColor: c.warn }]}>
                <Ionicons name={!next ? 'locate' : where.onRoute ? 'flag' : 'return-up-forward'} size={22} color={c.white} />
              </View>
              <View style={{ flex: 1 }}>
                {next ? (
                  <>
                    <Text style={st.kicker}>{where.onRoute ? 'Próximo ponto' : 'Fora do percurso · vá até'}</Text>
                    <Text style={st.bannerTitle} numberOfLines={1}>{next.name}</Text>
                    <Text style={st.bannerSub} numberOfLines={1}>{dist(next.remainingM)}{next.etaS != null ? ` · ${eta(next.etaS)}` : ''}</Text>
                  </>
                ) : (
                  <>
                    <Text style={st.bannerTitle}>Procurando GPS…</Text>
                    <Text style={st.bannerSub}>Fique em local aberto</Text>
                  </>
                )}
              </View>
            </View>
            {notices.map((n) => (
              <View key={n} style={st.notice}>
                <Ionicons name="alert-circle" size={14} color={c.white} />
                <Text style={st.noticeText} numberOfLines={1}>{n}</Text>
              </View>
            ))}
          </View>

          {/* Estatísticas: o principal sempre visível; o resto em "Mais dados". */}
          <View style={st.sheet} onLayout={(e) => setBottom(e.nativeEvent.layout.height + 12)}>
            <Pressable onPress={() => setMore((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: more }}
              accessibilityLabel={more ? 'Mostrar menos dados' : 'Mostrar mais dados'} style={st.handleArea} hitSlop={6}>
              <View style={st.handle} />
            </Pressable>
            <View style={st.row}>
              <Metric big label={live.currentPaceS ? 'Pace atual' : 'Pace médio'} value={fmtPace(live.currentPaceS ?? avgPace)} unit="/km" />
              <Metric big label="Distância" value={kmBR(me.distance_m, me.distance_m < 10_000 ? 2 : 1)} unit="km" />
              <Metric big label="Tempo" value={fmtClock(elapsedS)} />
            </View>
            {more && (
              <>
                <View style={st.divider} />
                <View style={st.row}>
                  {live.currentPaceS ? <Metric label="Pace médio" value={fmtPace(avgPace)} unit="/km" /> : <Metric label="Pace atual" value="—" />}
                  <Metric label="Velocidade" value={speed} unit="km/h" />
                  <Metric label="Pace ativo" value={fmtPace(live.movingPaceS)} unit="/km" />
                </View>
                <View style={st.row}>
                  <Metric label="Tempo ativo" value={fmtClock(live.movingS || null)} />
                  <Metric label="Km do percurso" value={where.kmNow != null ? kmBR(where.kmNow * 1000, 1) : '—'} />
                  <Metric label="Previsão total" value={finish?.etaS != null ? dur(elapsedS + finish.etaS) : '—'} />
                </View>
                {finish && (
                  <View style={st.finish}>
                    <Ionicons name="trophy-outline" size={16} color={c.orangeDark} />
                    <Text style={st.finishText} numberOfLines={1}>
                      Chegada: {dist(finish.remainingM)}{finish.etaS != null ? ` · ${eta(finish.etaS)} · às ${hhmm(finish.at)}` : ''}
                    </Text>
                  </View>
                )}
                {!live.currentPaceS && <Text style={st.hint}>O pace atual aparece após ~30 s em movimento.</Text>}
              </>
            )}
            <Pressable onPress={() => setMore((v) => !v)} style={st.moreBtn} accessibilityRole="button" hitSlop={6}>
              <Text style={st.moreText}>{more ? 'Menos dados' : 'Mais dados'}</Text>
              <Ionicons name={more ? 'chevron-down' : 'chevron-up'} size={14} color={c.inkSoft} />
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function Metric({ label, value, unit, big }: { label: string; value: string; unit?: string; big?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }} accessible accessibilityLabel={`${label}: ${value} ${unit ?? ''}`}>
      <Text style={big ? st.valueBig : st.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}{unit && value !== '—' ? <Text style={st.unit}> {unit}</Text> : null}
      </Text>
      <Text style={st.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  topWrap: { position: 'absolute', top: 0, left: 0, right: 88, padding: 12, paddingRight: 0, gap: 6 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.charcoal, borderRadius: 16, padding: 12, ...shadow, shadowOpacity: 0.25 },
  bannerIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.orangeDark, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: font.bold, fontSize: 10.5, color: c.orangeLight, textTransform: 'uppercase', letterSpacing: 0.6 },
  bannerTitle: { fontFamily: font.display, fontSize: 19, color: c.white },
  bannerSub: { fontFamily: font.bold, fontSize: 15, color: c.sand },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: c.danger, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  noticeText: { fontFamily: font.bold, fontSize: 12, color: c.white, flexShrink: 1 },
  sheet: { position: 'absolute', left: 8, right: 8, bottom: 8, backgroundColor: c.surface, borderRadius: 18, paddingHorizontal: 8, paddingBottom: 6, gap: 8, ...shadow, shadowOpacity: 0.22 },
  handleArea: { alignItems: 'center', paddingTop: 7, paddingBottom: 1 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: c.line },
  row: { flexDirection: 'row' },
  divider: { height: 1, backgroundColor: c.line, marginHorizontal: 8 },
  valueBig: { fontFamily: font.display, fontSize: 25, color: c.charcoal },
  value: { fontFamily: font.display, fontSize: 18, color: c.charcoal },
  unit: { fontFamily: font.bold, fontSize: 11, color: c.inkSoft },
  label: { fontFamily: font.bold, fontSize: 10, color: c.inkSoft, textTransform: 'uppercase', letterSpacing: 0.4 },
  finish: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  finishText: { fontFamily: font.bold, fontSize: 13, color: c.charcoal, flexShrink: 1 },
  hint: { fontFamily: font.body, fontSize: 11.5, color: c.inkSoft, paddingHorizontal: 8 },
  moreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 2 },
  moreText: { fontFamily: font.bold, fontSize: 11.5, color: c.inkSoft },
});
