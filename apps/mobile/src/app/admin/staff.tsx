import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { isEmail, type Api } from '@mb/core';
import { Body, Input, Screen } from '@/components/ui';
import { act, Card, confirm, ListItem, SmallButton } from '@/components/admin/kit';
import { api } from '@/lib/services';

type Member = Awaited<ReturnType<Api['staff']>>[number];
type Change = Awaited<ReturnType<Api['roleChanges']>>[number];

/** Equipe da organização: só organizadores concedem ou retiram acesso (registrado no histórico). */
export default function Staff() {
  const [staff, setStaff] = useState<Member[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [email, setEmail] = useState('');
  const [me, setMe] = useState('');

  const load = useCallback(async () => {
    const [s, ch, id] = await Promise.all([api.staff(), api.roleChanges().catch(() => []), api.me()]);
    setStaff(s);
    setChanges(ch);
    setMe(id);
  }, []);
  useFocusEffect(useCallback(() => void load().catch(() => undefined), [load]));

  async function add() {
    if (!isEmail(email)) return Alert.alert('Confira o e-mail', 'Informe o e-mail de uma conta já cadastrada no app.');
    if (await act('admin.staff_add', () => api.setStaff(email.trim(), true)) !== undefined) {
      setEmail('');
      await load();
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <Card title="Adicionar organizador">
            <Body muted small>A pessoa precisa ter conta no app. Organizadores veem localização, contatos e logs de todos os eventos oficiais. Também dá para promover pela tela Pessoas.</Body>
            <Input placeholder="E-mail da conta" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
            <SmallButton icon="person-add-outline" label="Adicionar" tone="primary" onPress={() => void add()} />
          </Card>

          <Card title={`Equipe (${staff.length})`}>
            {staff.map((m) => (
              <View key={m.id} style={{ gap: 6 }}>
                <ListItem title={`${m.display_name}${m.id === me ? ' (você)' : ''}`} subtitle={m.email} onPress={() => router.push(`/admin/person/${m.id}`)} />
                {m.id !== me && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <SmallButton icon="remove-circle-outline" label="Remover" tone="danger" onPress={() => confirm(`Remover ${m.display_name} da equipe?`, 'A pessoa perde acesso à área da organização.', 'Remover',
                      () => void act('admin.staff_remove', () => api.setStaff(m.email, false)).then(load), true)} />
                  </View>
                )}
              </View>
            ))}
          </Card>

          <Card title="Histórico de permissões">
            {!changes.length && <Body muted small>Nenhuma mudança registrada.</Body>}
            {changes.map((ch, i) => (
              <Body key={i} small>
                {new Date(ch.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {ch.user_name} {ch.role === 'admin' ? 'virou organizador' : 'deixou a organização'}{ch.actor_name ? ` · por ${ch.actor_name}` : ' · pelo sistema'}
              </Body>
            ))}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
