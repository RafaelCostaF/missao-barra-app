import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/ui';
import { HelpChat } from '@/components/HelpChat';
import { SmallButton } from '@/components/admin/kit';
import { useOpenHelp } from '@/hooks/useOpenHelp';
import { api } from '@/lib/services';
import { c, font } from '@/theme';

/** Atendimento (conversa de ajuda) com um participante. Perfil só pelo botão. */
export default function AdminChat() {
  const { session, user } = useLocalSearchParams<{ session: string; user: string }>();
  const [me, setMe] = useState('');
  const [name, setName] = useState('Atendimento');
  useEffect(() => {
    void api.me().then(setMe);
    void api.names([user]).then((n) => n[0] && setName(n[0].display_name)).catch(() => undefined);
  }, [user]);
  const { open, close } = useOpenHelp(session, user, true);

  return (
    <Screen>
      <Stack.Screen options={{ title: name }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100} style={{ flex: 1, gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Text style={{ flex: 1, fontFamily: font.bold, fontSize: 12.5, color: open === 'emergency' ? c.danger : open ? c.warn : c.inkSoft }} numberOfLines={2}>
            {open === 'emergency' ? 'Emergência aberta' : open ? 'Ajuda aberta' : 'Sem atendimento aberto'}
          </Text>
          <SmallButton icon="person-outline" label="Perfil" a11y="Ver perfil e contato" onPress={() => router.push(`/admin/participant?session=${session}&user=${user}`)} />
          {open && <SmallButton icon="checkmark-done-outline" label="Encerrar" a11y="Encerrar atendimento" tone="primary" onPress={close} />}
        </View>
        {me ? <HelpChat sessionId={session} userId={user} me={me} asOrg name={name === 'Atendimento' ? undefined : name} /> : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}
