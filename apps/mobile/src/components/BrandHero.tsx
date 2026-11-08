import { useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import type { Session } from '@mb/core';
import { c, font, radius } from '@/theme';
import logo from '@mb/ui-tokens/icons/icon-512.png';

/** "em 12 dias" / "amanhã" / "hoje" / "AO VIVO" para a próxima missão. */
export function countdown(next: Pick<Session, 'starts_at' | 'status'> | undefined, now = Date.now()): string | null {
  if (!next) return null;
  if (next.status === 'live') return 'Ao vivo agora';
  if (!next.starts_at) return 'Data a definir';
  const start = new Date(next.starts_at);
  const today = new Date(now);
  const days = Math.round((new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);
  if (days < 0) return null;
  return days === 0 ? 'Hoje' : days === 1 ? 'Amanhã' : `Em ${days} dias`;
}

/** Abertura do app: farol com luz girando, nome e lema. */
/** `compact`: versão menor para o login (teclado aberto). */
export function BrandHero({ next, compact }: { next?: Session; compact?: boolean }) {
  const spin = useState(() => new Animated.Value(0))[0];
  const enter = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin, enter]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const when = countdown(next);

  return (
    <Animated.View style={[st.hero, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
      <View style={st.logoWrap}>
        {/* Feixe do farol: dois cones girando atrás do ícone. */}
        <Animated.View style={[st.beam, { transform: [{ rotate }] }]} pointerEvents="none">
          <View style={st.cone} />
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', transform: [{ rotate: '180deg' }] }]}><View style={st.cone} /></View>
        </Animated.View>
        <Image source={logo} style={[st.logo, compact && { width: 60, height: 60, borderRadius: 14 }]} accessibilityLabel="Farol da Missão Barra" />
      </View>
      <Text style={st.kicker}>Caminhada de 40 km · Salvador</Text>
      <Text style={[st.name, compact && { fontSize: 40, lineHeight: 41 }]} accessibilityRole="header">MISSÃO{'\n'}BARRA</Text>
      <Text style={st.motto}>Missão dada é Missão Barra!</Text>
      {next && when && (
        <View style={st.next}>
          <Text style={st.nextLabel}>Próxima missão · {when}</Text>
          <Text style={st.nextName} numberOfLines={1}>{next.name}</Text>
        </View>
      )}
      <View style={st.wave} />
    </Animated.View>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: c.charcoal, borderRadius: radius + 4, padding: 22, paddingTop: 26, overflow: 'hidden', alignItems: 'flex-start' },
  logoWrap: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  beam: { position: 'absolute', width: 260, height: 260, alignItems: 'center', justifyContent: 'center' },
  cone: {
    position: 'absolute', width: 0, height: 0, top: 0, borderLeftWidth: 34, borderRightWidth: 34, borderTopWidth: 130,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: 'rgba(235, 109, 53, 0.16)',
  },
  logo: { width: 84, height: 84, borderRadius: 20 },
  kicker: { fontFamily: font.bold, color: c.orangeLight, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase' },
  name: { fontFamily: font.display, color: c.white, fontSize: 52, lineHeight: 52, marginTop: 6 },
  motto: { fontFamily: font.body, color: c.sand, fontSize: 17, marginTop: 10, transform: [{ rotate: '-2deg' }] },
  next: { marginTop: 18, alignSelf: 'stretch', borderTopWidth: 1, borderTopColor: c.lineOnDark, paddingTop: 12, gap: 2 },
  nextLabel: { fontFamily: font.bold, color: c.orangeLight, fontSize: 11.5, letterSpacing: 1.2, textTransform: 'uppercase' },
  nextName: { fontFamily: font.display, color: c.white, fontSize: 17 },
  wave: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, backgroundColor: c.orange },
});
