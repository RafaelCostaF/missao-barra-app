import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SIGNAL_LABEL, type SignalState } from '@mb/core';
import { c, font, radius, signalColor } from '@/theme';

export function Screen({ children }: { children: ReactNode }) {
  return <SafeAreaView style={s.screen} edges={['bottom']}>{children}</SafeAreaView>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[s.body, muted && { color: c.inkSoft }]}>{children}</Text>;
}

type Variant = 'primary' | 'secondary' | 'danger';
export function Button({ label, onPress, variant = 'primary', busy, disabled }: { label: string; onPress: () => void; variant?: Variant; busy?: boolean; disabled?: boolean }) {
  const bg = { primary: c.orangeDark, secondary: c.white, danger: '#B3261E' }[variant];
  const fg = variant === 'secondary' ? c.charcoal : c.white;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [s.button, { backgroundColor: pressed ? c.charcoal : bg, opacity: disabled ? 0.5 : 1 }, variant === 'secondary' && s.outline]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, { color: fg }]}>{label.toUpperCase()} →</Text>}
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={c.inkSoft} {...props} style={[s.input, props.style]} />;
}

export function SignalBadge({ state }: { state: SignalState }) {
  return (
    <View style={[s.badge, { backgroundColor: signalColor[state] }]}>
      <Text style={s.badgeText}>{SIGNAL_LABEL[state]}</Text>
    </View>
  );
}

export function Row({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  return <Pressable onPress={onPress} style={s.row}>{children}</Pressable>;
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.white, padding: 16, gap: 12 },
  title: { fontFamily: font.display, fontSize: 24, color: c.charcoal, textTransform: 'uppercase' },
  body: { fontFamily: font.body, fontSize: 16, color: c.charcoal, lineHeight: 22 },
  button: { minHeight: 52, borderRadius: radius, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  outline: { borderWidth: 2, borderColor: c.charcoal },
  buttonText: { fontFamily: font.bold, fontSize: 15, letterSpacing: 1.2 },
  input: { borderWidth: 2, borderColor: c.line, borderRadius: radius, padding: 12, fontFamily: font.body, fontSize: 16, backgroundColor: '#fff' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius },
  badgeText: { color: '#fff', fontFamily: font.bold, fontSize: 12, textTransform: 'uppercase' },
  row: { padding: 14, borderRadius: radius, backgroundColor: c.sand, gap: 4 },
});
