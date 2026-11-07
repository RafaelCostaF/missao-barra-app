import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Body, Button, Input, Screen, Title } from '@/components/ui';
import { api, logger } from '@/lib/services';

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
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
      <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        <Title>Missão Barra</Title>
        <Body muted>Missão dada é Missão Barra!</Body>
        {mode === 'up' && <Input placeholder="Seu nome" value={name} onChangeText={setName} />}
        <Input placeholder="E-mail" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <Input placeholder="Senha" secureTextEntry value={password} onChangeText={setPassword} />
        <Button label={mode === 'in' ? 'Entrar' : 'Criar conta'} onPress={submit} busy={busy} />
        <Button variant="secondary" label={mode === 'in' ? 'Criar conta' : 'Já tenho conta'} onPress={() => setMode(mode === 'in' ? 'up' : 'in')} />
      </View>
    </Screen>
  );
}
