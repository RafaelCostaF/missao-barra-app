import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen } from '@/components/ui';
import { HelpChat } from '@/components/HelpChat';
import { SmallButton } from '@/components/admin/kit';
import { useOpenHelp } from '@/hooks/useOpenHelp';
import { api } from '@/lib/services';
import { c, font, radius } from '@/theme';

/** Pedido de ajuda por conversa com a organização (evento oficial). */
export default function Help() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [me, setMe] = useState('');
  useEffect(() => void api.me().then(setMe), []);
  const { open, close } = useOpenHelp(id, me, false);
  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100} style={{ flex: 1, gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#FDECEA', borderRadius: radius, padding: 10 }}>
          <Ionicons name="warning-outline" size={18} color={c.danger} />
          <Text style={{ flex: 1, fontFamily: font.body, fontSize: 12.5, color: c.charcoal }}>
            Risco de vida? Use o botão Emergência ou ligue 192 (SAMU) / 193.
          </Text>
        </View>
        {open && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, fontFamily: font.bold, fontSize: 13, color: open === 'emergency' ? c.danger : c.warn }}>
              {open === 'emergency' ? 'Emergência em atendimento' : 'Pedido de ajuda em atendimento'}
            </Text>
            <SmallButton icon="checkmark-done-outline" label="Encerrar atendimento" onPress={close} />
          </View>
        )}
        {me ? <HelpChat sessionId={id} userId={me} me={me} /> : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}
