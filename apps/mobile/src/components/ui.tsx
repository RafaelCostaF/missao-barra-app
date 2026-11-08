import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SIGNAL_LABEL, type SignalState } from '@mb/core';
import { c, font, radius, shadow, signalColor, space } from '@/theme';

export function Screen({ children }: { children: ReactNode }) {
  return <SafeAreaView style={s.screen} edges={['bottom']}>{children}</SafeAreaView>;
}

export function Title({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return <Text style={[s.title, { fontSize: size }]}>{children}</Text>;
}

export function Body({ children, muted, small }: { children: ReactNode; muted?: boolean; small?: boolean }) {
  return <Text style={[s.body, muted && { color: c.inkSoft }, small && { fontSize: 13, lineHeight: 18 }]}>{children}</Text>;
}

/** Entrada suave (opacidade + leve subida); `index` escalona listas. */
export function FadeIn({ children, index = 0 }: { children: ReactNode; index?: number }) {
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 320, delay: Math.min(index, 8) * 50, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, index]);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>{children}</Animated.View>;
}

type Variant = 'primary' | 'secondary' | 'danger';
/** Botão da marca: encolhe ao toque; `haptic` dá retorno tátil em ações importantes. */
export function Button({ label, onPress, variant = 'primary', busy, disabled, icon, haptic }: {
  label: string; onPress: () => void; variant?: Variant; busy?: boolean; disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap; haptic?: 'light' | 'heavy';
}) {
  const scale = useState(() => new Animated.Value(1))[0];
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  const bg = { primary: c.orangeDark, secondary: c.surface, danger: c.danger }[variant];
  const fg = variant === 'secondary' ? c.charcoal : c.white;
  return (
    <Animated.View style={{ transform: [{ scale }], opacity: disabled ? 0.5 : 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled || busy}
        onPressIn={() => to(0.97)}
        onPressOut={() => to(1)}
        onPress={() => {
          if (haptic) void Haptics.impactAsync(haptic === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        style={[s.button, { backgroundColor: bg }, variant === 'secondary' && s.outline, variant !== 'secondary' && shadow]}
      >
        {busy ? <ActivityIndicator color={fg} /> : (
          <View style={s.buttonInner}>
            {icon && <Ionicons name={icon} size={18} color={fg} />}
            <Text style={[s.buttonText, { color: fg }]}>{label.toUpperCase()}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={c.inkSoft} {...props} style={[s.input, props.style]} />;
}

/** Ponto pulsante: indica "ao vivo" sem chamar atenção demais. */
export function PulseDot({ color = c.ok, active = true }: { color?: string; active?: boolean }) {
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v, active]);
  return (
    <View style={{ width: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}>
      {active && <Animated.View style={{ position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }] }} />}
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

export function SignalBadge({ state }: { state: SignalState }) {
  return (
    <View style={[s.badge, { backgroundColor: `${signalColor[state]}1A` }]}>
      <PulseDot color={signalColor[state]} active={state === 'tracking'} />
      <Text style={[s.badgeText, { color: signalColor[state] }]}>{SIGNAL_LABEL[state]}</Text>
    </View>
  );
}

/** Cartão de lista (toque opcional) com entrada escalonada. */
export function Row({ children, onPress, index }: { children: ReactNode; onPress?: () => void; index?: number }) {
  return (
    <FadeIn index={index}>
      <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]}>{children}</Pressable>
    </FadeIn>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

export function Empty({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <FadeIn>
      <View style={s.empty}>
        <Ionicons name={icon} size={36} color={c.inkSoft} />
        <Body muted>{text}</Body>
      </View>
    </FadeIn>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.white, padding: space.lg, gap: space.md },
  title: { fontFamily: font.display, color: c.charcoal, textTransform: 'uppercase' },
  body: { fontFamily: font.body, fontSize: 15, color: c.charcoal, lineHeight: 21 },
  button: { minHeight: 52, borderRadius: radius, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  outline: { borderWidth: 1.5, borderColor: c.line },
  buttonText: { fontFamily: font.bold, fontSize: 14, letterSpacing: 1.1 },
  input: { borderWidth: 1.5, borderColor: c.line, borderRadius: radius, padding: 14, fontFamily: font.body, fontSize: 16, backgroundColor: c.surface },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeText: { fontFamily: font.bold, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { padding: space.lg, borderRadius: radius, backgroundColor: c.surface, gap: space.sm, borderWidth: 1, borderColor: c.line, ...shadow },
  stat: { flex: 1, backgroundColor: c.surface, borderRadius: radius, padding: space.md, borderWidth: 1, borderColor: c.line },
  statValue: { fontFamily: font.display, fontSize: 20, color: c.charcoal },
  statLabel: { fontFamily: font.body, fontSize: 11, color: c.inkSoft, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: 48 },
});
