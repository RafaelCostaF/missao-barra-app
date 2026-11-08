import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LiveMap } from '@/components/LiveMap';
import * as Battery from 'expo-battery';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  averagePaceS, fmtClock, fmtPace, nearbyRunners, racePosition, routeStatus,
  type Checkpoint, type Eta, type LiveParticipant,
} from '@mb/core';
import { FadeIn } from '@/components/ui';
import { api, queue, tracker } from '@/lib/services';
import { c, font, radius, shadow } from '@/theme';

const km = (m: number) => `${(m / 1000).toFixed(m < 10_000 ? 2 : 1).replace('.', ',')}`;
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
const meters = (m: number) => (Math.abs(m) >= 1000 ? `${(Math.abs(m) / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(Math.abs(m))} m`);

/** Hora em que a pessoa iniciou o percurso (auditoria do servidor): base do tempo e do pace médio ao abrir a tela. */
function useStartedAt(sessionId: string, userId: string, status?: string) {
  const [at, setAt] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  useEffect(() => {
    if (!userId) return;
    void api.timeline(sessionId, userId).then((ev) => setAt({
      start: ev.find((e) => e.event === 'tracking')?.at ?? null,
      end: [...ev].reverse().find((e) => e.event === 'finished')?.at ?? null,
    })).catch(() => undefined);
  }, [sessionId, userId, status]);
  return at;
}

/** Bateria e posições ainda não enviadas (sem internet), atualizadas junto com a tela. */
function useDevice(now: number) {
  const [d, setD] = useState<{ battery: number | null; pending: number }>({ battery: null, pending: 0 });
  useEffect(() => {
    void Promise.all([Battery.getBatteryLevelAsync().catch(() => -1), queue.state().catch(() => ({ pending: [] }))]).then(([b, q]) =>
      setD({ battery: b < 0 ? null : Math.round(b * 100), pending: (q as { pending: unknown[] }).pending.length }));
  }, [now]);
  return d;
}

/**
 * Painel do corredor (como relógio GPS): pace, tempo, distância, próximo ponto com estimativa,
 * previsão de chegada, posição na prova, quem está perto, parciais e estado do GPS.
 */
export function RunPanel({ sessionId, me, participants, checkpoints, now }: {
  sessionId: string; me: LiveParticipant; participants: LiveParticipant[]; checkpoints: Checkpoint[]; now: number;
}) {
  const { start, end } = useStartedAt(sessionId, me.user_id, me.status);
  const device = useDevice(now);
  const live = tracker.stats.snapshot(now);
  const finished = me.status === 'finished';

  const elapsedS = start ? ((finished && end ? Date.parse(end) : now) - Date.parse(start)) / 1000 : live.movingS;
  const avgPace = averagePaceS(start, me.distance_m, finished && end ? Date.parse(end) : now);
  // Pace para estimativas: atual (últimos ~3 min) → em movimento → médio.
  const paceForEta = live.currentPaceS ?? live.movingPaceS ?? avgPace;
  const pos = me.last_lat != null ? { lat: me.last_lat, lng: me.last_lng! } : null;
  // Sempre a partir da posição real: no percurso, próximo ponto à frente; fora dele, o ponto mais perto.
  const where = routeStatus(pos, checkpoints, paceForEta, now);
  const { next, finish, kmNow } = where;
  const others = participants.filter((p) => p.user_id !== me.user_id);
  const near = pos ? nearbyRunners(pos, kmNow, others, checkpoints, 2000, now).slice(0, 5) : [];
  const rank = racePosition(me.user_id, participants);
  const heroPace = live.currentPaceS ?? avgPace;
  const [showMap, setShowMap] = useState(true);
  // Caminho à frente: da posição até os próximos pontos (fora do percurso: tracejado até o mais perto).
  const route = [...checkpoints].sort((a, b) => a.km - b.km);
  const target = next ? route.find((c) => c.name === next.name && c.km === next.km) : null;
  const ahead = !pos ? [] : where.onRoute ? [pos, ...route.filter((c) => c.km > kmNow!)] : target ? [pos, target] : [];

  if (finished) {
    return (
      <FadeIn>
        <View style={st.hero}>
          <Text style={st.heroLabel}>Sua corrida</Text>
          <View style={st.grid}>
            <Metric dark label="Distância" value={km(me.distance_m)} unit="km" />
            <Metric dark label="Tempo" value={fmtClock(elapsedS)} />
            <Metric dark label="Pace médio" value={fmtPace(avgPace)} unit="/km" />
          </View>
          {rank && <Text style={st.heroSub}>{rank.position}º de {rank.total} pela distância percorrida</Text>}
          <Splits splits={live.splits} />
        </View>
      </FadeIn>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {/* Mapa de quem está correndo: segue você, mostra o caminho à frente e quem está perto. */}
      <Pressable onPress={() => setShowMap((v) => !v)} style={st.mapToggle} accessibilityRole="button" accessibilityState={{ expanded: showMap }}>
        <Ionicons name={showMap ? 'chevron-up' : 'map-outline'} size={15} color={c.charcoal} />
        <Text style={st.mapToggleText}>{showMap ? 'Esconder mapa' : 'Mostrar mapa'}</Text>
      </Pressable>
      {showMap && (
        <View style={st.map}>
          <LiveMap participants={participants} checkpoints={checkpoints} now={now}
            runner={{
              me: pos, ahead, aheadStraight: !where.onRoute,
              overlay: (
                <View style={st.chip}>
                  <Text style={st.chipPace}>{fmtPace(heroPace)}<Text style={st.chipUnit}> /km</Text></Text>
                  {next && (
                    <Text style={st.chipNext} numberOfLines={1}>
                      {next.name} · {km(next.remainingM)} km{next.etaS != null ? ` · ~${fmtClock(next.etaS)}` : ''}
                    </Text>
                  )}
                </View>
              ),
            }} />
        </View>
      )}
      <FadeIn>
        <View style={st.hero}>
          <Text style={st.heroLabel}>{live.currentPaceS ? 'Pace atual' : heroPace ? 'Pace médio' : 'Pace'}</Text>
          <Text style={st.pace} accessibilityLabel={`Pace ${fmtPace(heroPace)} por quilômetro`}>{fmtPace(heroPace)}<Text style={st.paceUnit}> /km</Text></Text>
          <View style={st.grid}>
            <Metric dark label="Distância" value={km(me.distance_m)} unit="km" />
            <Metric dark label="Tempo" value={fmtClock(elapsedS)} />
            <Metric dark label="Pace médio" value={fmtPace(avgPace)} unit="/km" />
          </View>
          <View style={st.grid}>
            <Metric dark label="Velocidade" value={live.speedKmh ? live.speedKmh.toFixed(1).replace('.', ',') : '—'} unit="km/h" />
            <Metric dark label="Em movimento" value={fmtClock(live.movingS || null)} />
            <Metric dark label="Pace em movimento" value={fmtPace(live.movingPaceS)} unit="/km" />
          </View>
          {!heroPace && <Text style={st.heroSub}>Você está parado: o pace aparece depois de ~30 s andando ou correndo.</Text>}
          {!live.currentPaceS && heroPace != null && <Text style={st.heroSub}>Mostrando o pace médio; o pace atual aparece após ~30 s em movimento.</Text>}
        </View>
      </FadeIn>

      {(next || finish) && (
        <FadeIn index={1}>
          <View style={st.card}>
            {next && <EtaRow icon="flag-outline" title={`${next.straight ? 'Ponto mais perto' : 'Próximo ponto'} · ${next.name}`} eta={next} />}
            {finish && finish.name !== next?.name && <EtaRow icon="trophy-outline" title={`Chegada · ${finish.name}`} eta={finish} total={finish.etaS != null ? elapsedS + finish.etaS : null} />}
            {next && finish?.name === next.name && finish.etaS != null && <Text style={st.muted}>Tempo total previsto: {fmtClock(elapsedS + finish.etaS)}</Text>}
            <Text style={st.muted}>
              {where.onRoute
                ? `Você está no km ${kmNow!.toFixed(1).replace('.', ',')} do percurso`
                : `Fora do percurso (a ${meters(where.offRouteM ?? 0)}): distâncias em linha reta até o ponto mais perto`}
              {paceForEta ? ` · estimativa no ${live.currentPaceS ? 'pace atual' : 'pace médio'} (${fmtPace(paceForEta)}/km)` : ''}
            </Text>
          </View>
        </FadeIn>
      )}

      <FadeIn index={2}>
        <View style={st.card}>
          <View style={st.head}>
            <Ionicons name="people-outline" size={18} color={c.orangeDark} />
            <Text style={st.title}>Perto de você</Text>
            {rank && <Text style={st.badge}>{rank.position}º de {rank.total}</Text>}
          </View>
          {rank?.ahead && <Text style={st.body}>{rank.ahead.gapM > 0 ? `${meters(rank.ahead.gapM)} atrás de ${rank.ahead.name}` : `Lado a lado com ${rank.ahead.name}`}</Text>}
          {!near.length && <Text style={st.muted}>Ninguém compartilhando posição num raio de 2 km.</Text>}
          {near.map((n) => (
            <View key={n.user_id} style={st.nearRow}>
              <View style={[st.dot, { backgroundColor: n.aheadM == null ? c.inkSoft : n.aheadM >= 0 ? c.orange : c.ok }]} />
              <Text style={[st.body, { flex: 1 }]} numberOfLines={1}>{n.name}</Text>
              <Text style={st.nearDist}>
                {n.aheadM == null ? `a ${meters(n.distanceM)}` : Math.abs(n.aheadM) < 30 ? 'ao seu lado' : `${meters(n.aheadM)} ${n.aheadM > 0 ? 'à frente' : 'atrás'}`}
              </Text>
            </View>
          ))}
        </View>
      </FadeIn>

      {live.splits.length > 0 && <FadeIn index={3}><View style={st.card}><Text style={st.title}>Parciais por km</Text><Splits light splits={live.splits} /></View></FadeIn>}

      <View style={st.status}>
        <Status icon="navigate-circle-outline" text={live.lastAccuracyM != null ? `GPS ±${Math.round(live.lastAccuracyM)} m` : 'GPS aguardando'} warn={live.lastAccuracyM != null && live.lastAccuracyM > 30} />
        {device.battery != null && <Status icon="battery-half-outline" text={`${device.battery}%`} warn={device.battery <= 20} />}
        <Status icon={device.pending ? 'cloud-offline-outline' : 'cloud-done-outline'} text={device.pending ? `${device.pending} aguardando internet` : `Enviado ${hhmm(me.last_at)}`} warn={device.pending > 0} />
      </View>
    </View>
  );
}

function Metric({ label, value, unit, dark }: { label: string; value: string; unit?: string; dark?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[st.metricValue, dark && { color: c.white }]} numberOfLines={1} adjustsFontSizeToFit>{value}{unit ? <Text style={st.metricUnit}> {unit}</Text> : null}</Text>
      <Text style={[st.metricLabel, dark && { color: c.sand }]}>{label}</Text>
    </View>
  );
}

function EtaRow({ icon, title, eta, total }: { icon: keyof typeof Ionicons.glyphMap; title: string; eta: Eta; total?: number | null }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={st.head}>
        <Ionicons name={icon} size={18} color={c.orangeDark} />
        <Text style={st.title} numberOfLines={1}>{title}</Text>
      </View>
      <Text style={st.etaBig}>
        {eta.straight ? 'a ' : 'faltam '}{km(eta.remainingM)} km{eta.etaS != null ? <Text style={st.etaSoft}> · ~{fmtClock(eta.etaS)} · chegada {hhmm(eta.at)}</Text> : null}
      </Text>
      {total != null && <Text style={st.muted}>Tempo total previsto: {fmtClock(total)}</Text>}
    </View>
  );
}

function Splits({ splits, light }: { splits: number[]; light?: boolean }) {
  if (!splits.length) return null;
  const best = Math.min(...splits);
  return (
    <View style={st.splits}>
      {splits.slice(-8).map((s, i, arr) => {
        const n = splits.length - arr.length + i + 1;
        return (
          <View key={n} style={[st.split, light && { backgroundColor: c.white, borderColor: c.line }, s === best && { borderColor: c.orange }]}>
            <Text style={[st.splitKm, light && { color: c.inkSoft }]}>km {n}</Text>
            <Text style={[st.splitPace, light && { color: c.charcoal }]}>{fmtPace(s)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Status({ icon, text, warn }: { icon: keyof typeof Ionicons.glyphMap; text: string; warn?: boolean }) {
  return (
    <View style={st.statusItem}>
      <Ionicons name={icon} size={14} color={warn ? c.danger : c.inkSoft} />
      <Text style={[st.statusText, warn && { color: c.danger }]}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  map: { height: 340, borderRadius: radius, overflow: 'hidden', borderWidth: 1, borderColor: c.line },
  mapToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 6 },
  mapToggleText: { fontFamily: font.bold, fontSize: 12, color: c.charcoal, textTransform: 'uppercase', letterSpacing: 0.5 },
  chip: { flexDirection: 'row', alignItems: 'baseline', gap: 10, backgroundColor: 'rgba(29,30,34,0.88)', borderRadius: radius, paddingHorizontal: 12, paddingVertical: 8 },
  chipPace: { fontFamily: font.display, fontSize: 24, color: c.white },
  chipUnit: { fontFamily: font.bold, fontSize: 12, color: c.sand },
  chipNext: { flex: 1, fontFamily: font.bold, fontSize: 13, color: c.sand },
  hero: { backgroundColor: c.charcoal, borderRadius: radius + 2, padding: 16, gap: 12, ...shadow },
  heroLabel: { fontFamily: font.bold, color: c.orangeLight, fontSize: 11.5, letterSpacing: 1.4, textTransform: 'uppercase' },
  heroSub: { fontFamily: font.body, color: c.sand, fontSize: 12 },
  pace: { fontFamily: font.display, color: c.white, fontSize: 64, lineHeight: 68, marginTop: -6 },
  paceUnit: { fontFamily: font.bold, fontSize: 18, color: c.sand },
  grid: { flexDirection: 'row', gap: 10 },
  metricValue: { fontFamily: font.display, fontSize: 22, color: c.charcoal },
  metricUnit: { fontFamily: font.bold, fontSize: 11, color: c.sand },
  metricLabel: { fontFamily: font.body, fontSize: 10.5, color: c.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: c.surface, borderRadius: radius, padding: 14, gap: 10, borderWidth: 1, borderColor: c.line, ...shadow },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: font.bold, fontSize: 13, color: c.charcoal, textTransform: 'uppercase', letterSpacing: 0.6, flexShrink: 1 },
  badge: { marginLeft: 'auto', fontFamily: font.display, fontSize: 15, color: c.orangeDark },
  body: { fontFamily: font.body, fontSize: 14.5, color: c.charcoal },
  muted: { fontFamily: font.body, fontSize: 12, color: c.inkSoft },
  etaBig: { fontFamily: font.display, fontSize: 19, color: c.charcoal },
  etaSoft: { fontFamily: font.bold, fontSize: 14, color: c.inkSoft },
  nearRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  nearDist: { fontFamily: font.bold, fontSize: 13, color: c.charcoal },
  splits: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  split: { borderWidth: 1.5, borderColor: c.lineOnDark, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: c.charcoalSoft },
  splitKm: { fontFamily: font.body, fontSize: 10.5, color: c.sand },
  splitPace: { fontFamily: font.bold, fontSize: 14, color: c.white },
  status: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  statusItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontFamily: font.body, fontSize: 12, color: c.inkSoft },
});
