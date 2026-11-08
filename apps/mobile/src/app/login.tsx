import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { isEmail, passwordProblem } from '@mb/core';
import { Body, Button, FadeIn, Input, Screen } from '@/components/ui';
import { c, font } from '@/theme';
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
          <View style={st.brand}>
            <Text style={st.kicker}>Caminhada de 40 km</Text>
            <Text style={st.logo}>MISSÃO{'\n'}BARRA</Text>
            <Text style={st.marker}>Missão dada é Missão Barra!</Text>
          </View>
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

const st = StyleSheet.create({
  brand: { backgroundColor: c.charcoal, borderRadius: 14, padding: 24, marginBottom: 12 },
  kicker: { fontFamily: font.bold, color: c.orangeLight, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  logo: { fontFamily: font.display, color: c.white, fontSize: 44, lineHeight: 46, marginTop: 6 },
  marker: { fontFamily: font.body, color: c.sand, fontSize: 15, marginTop: 10, transform: [{ rotate: '-2deg' }] },
});
