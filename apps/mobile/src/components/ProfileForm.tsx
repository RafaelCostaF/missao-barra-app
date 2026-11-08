import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatPhoneBR, isPhoneBR, maskPhoneBR, profileMissing, toE164BR, type Contact } from '@mb/core';
import { Body, Button, FadeIn, Input, Screen, Title } from '@/components/ui';
import { api, logger } from '@/lib/services';
import { pickPhoto } from '@/lib/photo';
import { StravaCard } from '@/components/Strava';
import { c, radius, shadow } from '@/theme';

const EMPTY = { name: '', phone: '', registration_number: '', emergency_name: '', emergency_phone: '', health_notes: '' };

/**
 * Cadastro: foto e celular são obrigatórios para iniciar evento oficial.
 * Visível só para a pessoa e para a organização. `onSaved`: quando aberto a partir de um evento (volta ao salvar).
 */
export function ProfileForm({ onSaved }: { onSaved?: () => void }) {
  const [f, setF] = useState(EMPTY);
  const [contact, setContact] = useState<Contact | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const setPhone = (k: 'phone' | 'emergency_phone') => (v: string) => setF((x) => ({ ...x, [k]: maskPhoneBR(v) }));

  const load = useCallback(async () => {
    const [p, ct] = await Promise.all([api.profile(), api.myContact()]);
    setContact(ct);
    setF({ name: p.display_name, phone: ct?.phone ? formatPhoneBR(ct.phone) : '', registration_number: ct?.registration_number ?? '',
      emergency_name: ct?.emergency_name ?? '', emergency_phone: ct?.emergency_phone ? maskPhoneBR(ct.emergency_phone) : '',
      health_notes: ct?.health_notes ?? '' });
    setPhotoUrl(ct?.photo_path ? await api.photoUrl(ct.photo_path).catch(() => null) : null);
  }, []);
  useFocusEffect(useCallback(() => void load().catch((e) => logger.error('api.profile_load', e)), [load]));

  async function run(key: string, event: string, fn: () => Promise<unknown>, fail: string) {
    setBusy(key);
    try {
      await logger.timed(event, fn);
      return true;
    } catch (e) {
      Alert.alert(fail, (e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function changePhoto(source: 'camera' | 'library') {
    Keyboard.dismiss();
    const bytes = await pickPhoto(source);
    if (!bytes) return;
    if (await run('photo', 'api.photo_upload', async () => api.saveMyContact({ photo_path: await api.uploadPhoto(bytes) }), 'Não foi possível enviar a foto')) await load();
  }

  async function save() {
    Keyboard.dismiss();
    const phone = f.phone ? toE164BR(f.phone) : null;
    const problem = f.name.trim().split(/\s+/).length < 2 ? 'Informe nome e sobrenome.'
      : f.phone && !phone ? 'Celular: informe DDD + número com 9 dígitos, ex.: (71) 99999-0000.'
      : f.emergency_phone && !isPhoneBR(f.emergency_phone) ? 'Celular do contato de emergência: informe DDD + número.'
      : null;
    if (problem) return Alert.alert('Confira os dados', problem);
    const clean = (s: string) => s.trim() || null;
    const ok = await run('save', 'api.profile_save', async () => {
      await api.setDisplayName(f.name.trim());
      await api.saveMyContact({ phone, registration_number: clean(f.registration_number), emergency_name: clean(f.emergency_name),
        emergency_phone: clean(f.emergency_phone), health_notes: clean(f.health_notes) });
    }, 'Não foi possível salvar');
    if (!ok) return;
    await load().catch(() => undefined);
    if (onSaved) onSaved();
    else Alert.alert('Cadastro salvo', 'A organização poderá falar com você se precisar.');
  }

  const missing = profileMissing(contact);

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
          {missing.length > 0 && (
            <FadeIn>
              <View style={st.warn}>
                <Ionicons name="alert-circle-outline" size={18} color={c.warn} />
                <View style={{ flex: 1 }}><Body small>Para participar de eventos oficiais falta: {missing.join(' e ')}.</Body></View>
              </View>
            </FadeIn>
          )}

          <FadeIn>
            <View style={[st.card, { alignItems: 'center' }]}>
              <Pressable accessibilityLabel="Alterar foto" onPress={() => changePhoto('library')} style={st.avatar}>
                {busy === 'photo' ? <ActivityIndicator color={c.orangeDark} /> : photoUrl ? <Image source={{ uri: photoUrl }} style={st.avatarImg} /> : <Ionicons name="person" size={44} color={c.inkSoft} />}
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button variant="secondary" icon="camera-outline" label="Câmera" onPress={() => changePhoto('camera')} />
                <Button variant="secondary" icon="images-outline" label="Galeria" onPress={() => changePhoto('library')} />
              </View>
              <Body muted small>Use uma foto do rosto: ajuda a equipe a te identificar.</Body>
            </View>
          </FadeIn>

          <FadeIn index={1}>
            <View style={st.card}>
              <Title size={14}>Seus dados</Title>
              <Input label="Nome completo" placeholder="Maria da Silva" value={f.name} onChangeText={set('name')} autoComplete="name" textContentType="name" />
              <Input label="Celular com DDD" placeholder="(71) 99999-0000" hint="DDD + 9 dígitos. Usado pela equipe para falar com você."
                value={f.phone} onChangeText={setPhone('phone')} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={15} />
              <Input label="Nº da inscrição (opcional)" placeholder="MB-0042" value={f.registration_number} onChangeText={set('registration_number')} autoCapitalize="characters" />
            </View>
          </FadeIn>

          <FadeIn index={2}>
            <View style={st.card}>
              <Title size={14}>Contato de emergência</Title>
              <Input label="Nome" placeholder="Quem avisar" value={f.emergency_name} onChangeText={set('emergency_name')} textContentType="name" />
              <Input label="Telefone com DDD" placeholder="(71) 99999-0000" value={f.emergency_phone} onChangeText={setPhone('emergency_phone')} keyboardType="phone-pad" maxLength={15} />
            </View>
          </FadeIn>

          <FadeIn index={3}>
            <View style={st.card}>
              <Title size={14}>Saúde (opcional)</Title>
              <Input placeholder="Alergias, condições ou medicamentos que a equipe deve saber" value={f.health_notes} onChangeText={set('health_notes')} multiline maxLength={500} style={{ minHeight: 80, textAlignVertical: 'top' }} />
            </View>
          </FadeIn>

          <Button icon="save-outline" haptic="light" label="Salvar" busy={busy === 'save'} onPress={save} />
          <Body muted small>Seus dados são vistos só por você e pela organização, trafegam criptografados (HTTPS) e ficam armazenados criptografados.</Body>
          {!onSaved && <FadeIn index={4}><StravaCard /></FadeIn>}
          {!onSaved && <Button icon="log-out-outline" variant="secondary" label="Sair da conta" onPress={() => void api.signOut()} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: c.surface, borderRadius: radius, padding: 16, gap: 12, borderWidth: 1, borderColor: c.line, ...shadow },
  avatar: { width: 112, height: 112, borderRadius: 56, backgroundColor: c.sand, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 3, borderColor: c.surface, ...shadow },
  avatarImg: { width: 112, height: 112 },
  warn: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.surface, borderRadius: radius, padding: 12, borderLeftWidth: 3, borderLeftColor: c.warn, borderWidth: 1, borderColor: c.line },
});
