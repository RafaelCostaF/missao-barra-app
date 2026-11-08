import { StyleSheet, Text, View } from 'react-native';
import { averagePaceS, fmtClock, fmtPace, racePosition, type LiveParticipant } from '@mb/core';
import { FadeIn } from '@/components/ui';
import { useStartedAt } from '@/hooks/useStartedAt';
import { kmBR } from '@/lib/fmt';
import { tracker } from '@/lib/services';
import { c, font, radius, shadow } from '@/theme';

/** Resumo depois de finalizar: distância, tempo, pace médio, posição e parciais. (Correndo: `RunnerView`.) */
export function RunPanel({ sessionId, me, participants, now }: {
  sessionId: string; me: LiveParticipant; participants: LiveParticipant[]; now: number;
}) {
  const { start, end } = useStartedAt(sessionId, me.user_id, me.status);
  const live = tracker.stats.snapshot(now);
  const until = end ? Date.parse(end) : now;
  const elapsedS = start ? (until - Date.parse(start)) / 1000 : live.movingS;
  const avgPace = averagePaceS(start, me.distance_m, until);
  const rank = racePosition(me.user_id, participants);
  return (
    <FadeIn>
      <View style={st.hero}>
        <Text style={st.heroLabel}>Sua corrida</Text>
        <View style={st.grid}>
          <Metric label="Distância" value={kmBR(me.distance_m, 2)} unit="km" />
          <Metric label="Tempo" value={fmtClock(elapsedS)} />
          <Metric label="Pace médio" value={fmtPace(avgPace)} unit="/km" />
        </View>
        {rank && <Text style={st.heroSub}>{rank.position}º de {rank.total} pela distância percorrida</Text>}
        <Splits splits={live.splits} />
      </View>
    </FadeIn>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={st.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}{unit && value !== '—' ? <Text style={st.metricUnit}> {unit}</Text> : null}</Text>
      <Text style={st.metricLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
    </View>
  );
}

function Splits({ splits }: { splits: number[] }) {
  if (!splits.length) return null;
  const best = Math.min(...splits);
  return (
    <View style={st.splits}>
      {splits.slice(-8).map((s, i, arr) => {
        const n = splits.length - arr.length + i + 1;
        return (
          <View key={n} style={[st.split, s === best && { borderColor: c.orange }]}>
            <Text style={st.splitKm}>km {n}</Text>
            <Text style={st.splitPace}>{fmtPace(s)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: c.charcoal, borderRadius: radius + 2, padding: 16, gap: 12, ...shadow },
  heroLabel: { fontFamily: font.bold, color: c.orangeLight, fontSize: 11.5, letterSpacing: 1.4, textTransform: 'uppercase' },
  heroSub: { fontFamily: font.body, color: c.sand, fontSize: 12 },
  grid: { flexDirection: 'row', gap: 10 },
  metricValue: { fontFamily: font.display, fontSize: 22, color: c.white },
  metricUnit: { fontFamily: font.bold, fontSize: 11, color: c.sand },
  metricLabel: { fontFamily: font.body, fontSize: 10.5, color: c.sand, textTransform: 'uppercase', letterSpacing: 0.5 },
  splits: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  split: { borderWidth: 1.5, borderColor: c.lineOnDark, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: c.charcoalSoft },
  splitKm: { fontFamily: font.body, fontSize: 10.5, color: c.sand },
  splitPace: { fontFamily: font.bold, fontSize: 14, color: c.white },
});
