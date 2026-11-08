import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { QUICK_HELP, QUICK_REPLY, type HelpMessage } from '@mb/core';
import { api, logger, supabase } from '@/lib/services';
import { c, font, radius } from '@/theme';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * Conversa de ajuda participante ↔ organização (evento oficial).
 * `userId` = dono da conversa (participante); `asOrg` = quem está vendo é a organização.
 */
export function HelpChat({ sessionId, userId, me, asOrg, compact }: { sessionId: string; userId: string; me: string; asOrg?: boolean; compact?: boolean }) {
  const [msgs, setMsgs] = useState<HelpMessage[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const load = useCallback(() => api.helpThread(sessionId, userId).then(setMsgs).catch((e) => logger.error('help.load', e)), [sessionId, userId]);
  useEffect(() => {
    void load();
    // Chega na hora pelo Realtime; a cada 20 s confere de novo (rede ruim pode perder eventos).
    const ch = api.subscribe(`help:${sessionId}:${userId}`, ['help_messages'], () => void load(), `user_id=eq.${userId}`);
    const t = setInterval(() => void load(), 20_000);
    return () => {
      clearInterval(t);
      void supabase.removeChannel(ch);
    };
  }, [sessionId, userId, load]);
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50); }, [msgs?.length]);

  async function send(body: string) {
    const b = body.trim();
    if (!b || sending) return;
    setSending(true);
    try {
      await logger.timed(asOrg ? 'help.reply' : 'help.send', () => api.sendHelp(sessionId, userId, b), { session_id: sessionId });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setText('');
      await load();
    } catch (e) {
      Alert.alert('Não foi possível enviar', `${(e as Error).message}. Verifique a internet e tente de novo.`);
    } finally {
      setSending(false);
    }
  }

  const quick = asOrg ? QUICK_REPLY : QUICK_HELP;
  return (
    <View style={[st.wrap, compact && { minHeight: 0 }]}>
      <ScrollView ref={scroll} style={compact ? { maxHeight: 280 } : { flex: 1 }} contentContainerStyle={{ gap: 6, padding: 4 }} keyboardShouldPersistTaps="handled">
        {msgs === null && <ActivityIndicator color={c.orangeDark} />}
        {msgs?.length === 0 && (
          <Text style={st.empty}>{asOrg ? 'Nenhuma mensagem ainda.' : 'Conte o que aconteceu. A equipe recebe sua mensagem e sua localização.'}</Text>
        )}
        {msgs?.map((m) => {
          const mine = m.sender_id === me;
          const fromOrg = m.sender_id !== m.user_id;
          return (
            <View key={m.id} style={[st.bubble, mine ? st.mine : st.theirs]}>
              {!mine && <Text style={st.who}>{fromOrg ? 'Organização' : 'Participante'}</Text>}
              <Text style={[st.body, mine && { color: c.white }]}>{m.body}</Text>
              <Text style={[st.time, mine && { color: c.sand }]}>{hhmm(m.created_at)}</Text>
            </View>
          );
        })}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }} keyboardShouldPersistTaps="handled">
        {quick.map((q) => (
          <Pressable key={q} onPress={() => void send(q)} style={st.quick} accessibilityRole="button" accessibilityLabel={`Enviar: ${q}`}>
            <Text style={st.quickText}>{q}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={st.inputRow}>
        <TextInput value={text} onChangeText={setText} placeholder={asOrg ? 'Responder…' : 'Escreva sua mensagem…'} placeholderTextColor={c.inkSoft}
          style={st.input} multiline maxLength={1000} accessibilityLabel="Mensagem" />
        <Pressable onPress={() => { Keyboard.dismiss(); void send(text); }} disabled={!text.trim() || sending} style={[st.send, (!text.trim() || sending) && { opacity: 0.4 }]}
          accessibilityRole="button" accessibilityLabel="Enviar mensagem">
          {sending ? <ActivityIndicator color={c.white} /> : <Ionicons name="send" size={18} color={c.white} />}
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, gap: 6 },
  empty: { fontFamily: font.body, fontSize: 14, color: c.inkSoft, textAlign: 'center', padding: 16 },
  bubble: { maxWidth: '82%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: c.orangeDark, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderBottomLeftRadius: 4 },
  who: { fontFamily: font.bold, fontSize: 11, color: c.orangeDark, textTransform: 'uppercase', letterSpacing: 0.4 },
  body: { fontFamily: font.body, fontSize: 15, color: c.charcoal, lineHeight: 20 },
  time: { fontFamily: font.body, fontSize: 10.5, color: c.inkSoft, alignSelf: 'flex-end' },
  quick: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: c.orange, backgroundColor: c.surface },
  quickText: { fontFamily: font.bold, fontSize: 13, color: c.orangeDark },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  input: { flex: 1, minHeight: 46, maxHeight: 120, borderWidth: 1.5, borderColor: c.line, borderRadius: radius, paddingHorizontal: 12, paddingVertical: 10, fontFamily: font.body, fontSize: 15, backgroundColor: c.surface, color: c.charcoal },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.orangeDark, alignItems: 'center', justifyContent: 'center' },
});
