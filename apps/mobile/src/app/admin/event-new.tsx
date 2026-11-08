import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { maskDateTimeBR, parseDateTimeBR } from '@mb/core';
import { Body, Button, Input, Screen } from '@/components/ui';
import { act, Card } from '@/components/admin/kit';
import { api } from '@/lib/services';
import { c } from '@/theme';

/** Novo evento oficial (só organização; o banco recusa para os demais). */
export default function NewEvent() {
  const [name, setName] = useState('');
  const [when, setWhen] = useState('');
  const [isTest, setIsTest] = useState(true);
  const [busy, setBusy] = useState(false);

  async function create() {
    const startsAt = when ? parseDateTimeBR(when) : null;
    if (name.trim().length < 3) return Alert.alert('Confira os dados', 'Informe o nome do evento.');
    if (when && !startsAt) return Alert.alert('Confira os dados', 'Data inválida. Use DD/MM/AAAA HH:MM, ex.: 15/03/2027 05:00.');
    setBusy(true);
    const ev = await act('api.save_event', () => api.saveEvent({ name: name.trim(), starts_at: startsAt, is_test: isTest }));
    setBusy(false);
    if (ev) router.replace(`/admin/event/${ev.id}?tab=percurso`);
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <Card title="Novo evento oficial">
            <Input label="Nome" placeholder="Missão Barra — 6ª edição" value={name} onChangeText={setName} />
            <Input label="Largada (opcional)" placeholder="DD/MM/AAAA HH:MM" hint="Horário de Brasília." value={when}
              onChangeText={(v) => setWhen(maskDateTimeBR(v))} keyboardType="number-pad" maxLength={16} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Body>Sessão de teste</Body>
                <Body muted small>Não entra nas estatísticas e pode ser apagada.</Body>
              </View>
              <Switch value={isTest} onValueChange={setIsTest} trackColor={{ true: c.orangeDark }} />
            </View>
          </Card>
          <Button icon="add-circle-outline" label="Criar e desenhar percurso" busy={busy} onPress={create} />
          <Body muted small>O evento nasce como rascunho: só aparece para participantes depois de publicado.</Body>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
