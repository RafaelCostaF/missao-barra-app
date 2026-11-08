import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { toCsv } from '@mb/core';
import { FadeIn } from '@/components/ui';
import { api, logger } from '@/lib/services';
import { c, font, radius, shadow } from '@/theme';

/** Papel da conta logada (null enquanto carrega). Usado para mostrar a área da organização. */
export function useIsAdmin() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const refresh = useCallback(() => api.profile().then((p) => setAdmin(p.role === 'admin')).catch(() => setAdmin(false)), []);
  useEffect(() => void refresh(), [refresh]);
  return { admin, refresh };
}

/** Executa uma ação da organização com log; erro vira alerta amigável. Devolve undefined se falhou. */
export async function act<T>(event: string, fn: () => Promise<T>, meta?: Record<string, unknown>): Promise<T | undefined> {
  try {
    return await logger.timed(event, fn, meta);
  } catch (e) {
    Alert.alert('Não foi possível concluir', (e as Error).message);
    return undefined;
  }
}

/** Pergunta antes de ações com efeito para outras pessoas. */
export const confirm = (title: string, text: string, ok: string, onOk: () => void, destructive = false) =>
  Alert.alert(title, text, [{ text: 'Cancelar', style: 'cancel' }, { text: ok, style: destructive ? 'destructive' : 'default', onPress: onOk }]);

/** CSV pelo menu de compartilhamento do sistema (e-mail, WhatsApp, Arquivos). */
export function shareCsv(title: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return Alert.alert('Nada para exportar');
  void Share.share({ title, message: toCsv(rows) });
}

export const open = (url: string) => void Linking.openURL(url).catch(() => Alert.alert('Não foi possível abrir', url));

export function Card({ children, title, right }: { children: ReactNode; title?: string; right?: ReactNode }) {
  return (
    <FadeIn>
      <View style={k.card}>
        {(title || right) && (
          <View style={k.cardHead}>
            {title && <Text style={k.h3}>{title}</Text>}
            {right}
          </View>
        )}
        {children}
      </View>
    </FadeIn>
  );
}

/** Fileira de opções roláveis (filtros). `hot` destaca em vermelho quando há gente na situação. */
export function Chips<T extends string>({ options, value, onChange, counts, hot = [] }: {
  options: Record<T, string>; value: T; onChange: (v: T) => void; counts?: Partial<Record<T, number>>; hot?: T[];
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
      {(Object.keys(options) as T[]).map((o) => {
        const active = o === value;
        const isHot = hot.includes(o) && !!counts?.[o];
        return (
          <Pressable key={o} onPress={() => onChange(o)} accessibilityRole="button" accessibilityState={{ selected: active }}
            style={[k.chip, active && k.chipActive, isHot && !active && { borderColor: c.danger }]}>
            <Text style={[k.chipText, active && { color: c.white }]}>
              {options[o]}{counts?.[o] != null ? ` ${counts[o]}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Kpis({ items }: { items: { label: string; value: string | number; tone?: 'ok' | 'warn' | 'danger' }[] }) {
  return (
    <View style={k.kpis}>
      {items.map((i) => (
        <View key={i.label} style={k.kpi}>
          <Text style={[k.kpiValue, i.tone && { color: { ok: c.ok, warn: c.warn, danger: c.danger }[i.tone] }]} numberOfLines={1} adjustsFontSizeToFit>{i.value}</Text>
          <Text style={k.kpiLabel}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function Bar({ label, value, max, note }: { label: string; value: number; max: number; note?: string }) {
  return (
    <View style={k.barRow}>
      <Text style={k.barLabel} numberOfLines={1}>{label}</Text>
      <View style={k.bar}><View style={[k.barFill, { width: `${(value / Math.max(1, max)) * 100}%` }]} /></View>
      <Text style={k.barValue}>{value}</Text>
      {note != null && <Text style={k.barNote}>{note}</Text>}
    </View>
  );
}

export function Pill({ text, color = c.inkSoft }: { text: string; color?: string }) {
  return <View style={[k.pill, { backgroundColor: color }]}><Text style={k.pillText}>{text}</Text></View>;
}

/** Linha tocável de lista (pessoa, evento, alerta). */
export function ListItem({ title, subtitle, right, onPress, accent }: { title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; accent?: string }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [k.item, accent && { borderLeftWidth: 4, borderLeftColor: accent }, pressed && { opacity: 0.8 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={k.itemTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={k.itemSub} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right}
      {onPress && <Ionicons name="chevron-forward" size={18} color={c.inkSoft} />}
    </Pressable>
  );
}

/** Botão compacto (ícone + texto) para ações secundárias em linha. */
export function SmallButton({ icon, label, onPress, tone = 'default', a11y }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tone?: 'default' | 'primary' | 'ok' | 'danger'; a11y?: string;
}) {
  const bg = { default: c.surface, primary: c.orangeDark, ok: c.ok, danger: c.danger }[tone];
  const fg = tone === 'default' ? c.charcoal : c.white;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y ?? label} style={({ pressed }) => [k.small, { backgroundColor: bg }, tone === 'default' && k.smallOutline, pressed && { opacity: 0.8 }]}>
      <Ionicons name={icon} size={16} color={fg} />
      {label ? <Text style={[k.smallText, { color: fg }]}>{label}</Text> : null}
    </Pressable>
  );
}

export const k = StyleSheet.create({
  card: { backgroundColor: c.surface, borderRadius: radius, padding: 14, gap: 10, borderWidth: 1, borderColor: c.line, ...shadow },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  h3: { fontFamily: font.bold, fontSize: 12, color: c.inkSoft, letterSpacing: 0.8, textTransform: 'uppercase' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface },
  chipActive: { backgroundColor: c.charcoal, borderColor: c.charcoal },
  chipText: { fontFamily: font.bold, fontSize: 12.5, color: c.charcoal },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: { flexGrow: 1, flexBasis: '30%', backgroundColor: c.surface, borderRadius: radius, padding: 10, borderWidth: 1, borderColor: c.line },
  kpiValue: { fontFamily: font.display, fontSize: 22, color: c.charcoal },
  kpiLabel: { fontFamily: font.body, fontSize: 10.5, color: c.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { flex: 1.4, fontFamily: font.body, fontSize: 12.5, color: c.charcoal },
  bar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: c.sand, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: c.orange, borderRadius: 4 },
  barValue: { width: 28, textAlign: 'right', fontFamily: font.bold, fontSize: 12.5, color: c.charcoal },
  barNote: { width: 62, textAlign: 'right', fontFamily: font.body, fontSize: 11, color: c.inkSoft },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontFamily: font.bold, fontSize: 10.5, color: c.white, textTransform: 'uppercase', letterSpacing: 0.4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surface, borderRadius: radius, padding: 12, borderWidth: 1, borderColor: c.line },
  itemTitle: { fontFamily: font.bold, fontSize: 15, color: c.charcoal },
  itemSub: { fontFamily: font.body, fontSize: 12.5, color: c.inkSoft },
  small: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 38, borderRadius: radius },
  smallOutline: { borderWidth: 1.5, borderColor: c.line },
  smallText: { fontFamily: font.bold, fontSize: 12.5, letterSpacing: 0.4, textTransform: 'uppercase' },
});
