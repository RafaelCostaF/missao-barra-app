import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { isEmail, passwordProblem } from '@mb/core';
import { Body, Button, FadeIn, Input, Screen } from '@/components/ui';
import { BrandHero } from '@/components/BrandHero';
import { api, logger } from '@/lib/services';

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const problem = !isEmail(email) ? 'Informe um e-mail válido.'
      : mode === 'up' && name.trim().split(/\s+/).length < 2 ? 'Informe nome e sobrenome.'
      : mode === 'up' ? passwordProblem(password) : null;
    if (problem) return Alert.alert('Confira os dados', problem);
    setBusy(true);
    try {
      if (mode === 'up') await api.signUp(email.trim(), password, name.trim());
      else await api.signIn(email.trim(), password);
    } catch (e) {
      void logger.warn('auth.error', { mode, reason: (e as Error).message });
      Alert.alert('Não foi possível entrar', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        <FadeIn>
          <BrandHero compact />
        </FadeIn>
        {mode === 'up' && <Input placeholder="Nome completo" value={name} onChangeText={setName} autoComplete="name" />}
        <Input placeholder="E-mail" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <Input placeholder="Senha" secureTextEntry value={password} onChangeText={setPassword} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} />
        {mode === 'up' && <Body muted small>Mínimo de 8 caracteres, com letras e números. Depois você adiciona foto e celular no Perfil.</Body>}
        <Button icon={mode === 'in' ? 'log-in-outline' : 'person-add-outline'} haptic="light" label={mode === 'in' ? 'Entrar' : 'Criar conta'} onPress={submit} busy={busy} />
        <Button variant="secondary" label={mode === 'in' ? 'Criar conta' : 'Já tenho conta'} onPress={() => setMode(mode === 'in' ? 'up' : 'in')} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

