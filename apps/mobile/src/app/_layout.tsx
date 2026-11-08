import '@/lib/bootstrap';
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useFonts, ArchivoBlack_400Regular } from '@expo-google-fonts/archivo-black';
import { Inter_400Regular, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { api, logContext, logger, supabase } from '@/lib/services';
import { useNotices } from '@/hooks/useNotices';
import { KeyboardBar } from '@/components/ui';
import { c, font } from '@/theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ ArchivoBlack_400Regular, Inter_400Regular, Inter_800ExtraBold });
  const [auth, setAuth] = useState<AuthSession | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setAuth(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Pseudônimo nos logs, nunca o id da conta.
  useEffect(() => {
    if (!auth) return void (logContext.pseudo_user = undefined);
    api.profile().then((p) => (logContext.pseudo_user = p.pseudo_id)).catch((e) => logger.error('auth.profile', e));
  }, [auth]);

  useEffect(() => {
    if (auth === undefined) return;
    const inLogin = segments[0] === 'login';
    if (!auth && !inLogin) router.replace('/login');
    if (auth && inLogin) router.replace('/');
  }, [auth, segments, router]);

  useNotices(auth?.user.id ?? null);

  if (!fontsLoaded || auth === undefined) return null;
  return (
    <>
    <Stack screenOptions={{ headerStyle: { backgroundColor: c.charcoal }, headerTintColor: c.white, headerTitleStyle: { fontFamily: font.display } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="session/[id]" options={{ title: 'Percurso' }} />
      <Stack.Screen name="race/new" options={{ title: 'Nova corrida' }} />
      <Stack.Screen name="help/[id]" options={{ title: 'Ajuda da organização', headerBackTitle: 'Voltar' }} />
      <Stack.Screen name="cadastro" options={{ title: 'Cadastro', headerBackTitle: 'Voltar' }} />
      <Stack.Screen name="admin/event-new" options={{ title: 'Novo evento', headerBackTitle: 'Voltar' }} />
      <Stack.Screen name="admin/event/[id]" options={{ title: 'Evento', headerBackTitle: 'Voltar' }} />
      <Stack.Screen name="admin/participant" options={{ title: 'Participante', headerBackTitle: 'Voltar' }} />
      <Stack.Screen name="admin/people" options={{ title: 'Pessoas', headerBackTitle: 'Voltar' }} />
      <Stack.Screen name="admin/person/[id]" options={{ title: 'Perfil', headerBackTitle: 'Voltar' }} />
      <Stack.Screen name="admin/staff" options={{ title: 'Equipe', headerBackTitle: 'Voltar' }} />
      <Stack.Screen name="admin/logs" options={{ title: 'Logs', headerBackTitle: 'Voltar' }} />
    </Stack>
    <KeyboardBar />
    </>
  );
}
