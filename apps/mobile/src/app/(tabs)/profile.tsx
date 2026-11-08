import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatPhoneBR, profileMissing, toE164BR, type Contact } from '@mb/core';
import { Body, Button, FadeIn, Input, Screen, Title } from '@/components/ui';
import { api, logger } from '@/lib/services';
import { pickPhoto } from '@/lib/photo';
import { c, radius, shadow } from '@/theme';

const EMPTY = { name: '', registration_number: '', emergency_name: '', emergency_phone: '', health_notes: '' };

/**
 * Cadastro: foto e celular verificado por SMS são obrigatórios para iniciar evento oficial.
 * Visível só para a pessoa e para a organização.
 */
export default function Profile() {
  const [f, setF] = useState(EMPTY);
  const [contact, setContact] = useState<Contact | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const load = useCallback(async () => {
    const [p, ct] = await Promise.all([api.profile(), api.myContact()]);
    setContact(ct);
    setF({ name: p.display_name, registration_number: ct?.registration_number ?? '', emergency_name: ct?.emergency_name ?? '',
      emergency_phone: ct?.emergency_phone ?? '', health_notes: ct?.health_notes ?? '' });
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
    const bytes = await pickPhoto(source);
    if (!bytes) return;
    if (await run('photo', 'api.photo_upload', async () => api.saveMyContact({ photo_path: await api.uploadPhoto(bytes) }), 'Não foi possível enviar a foto')) await load();
  }

  async function sendCode() {
    const e164 = toE164BR(phone);
    if (!e164) return Alert.alert('Celular inválido', 'Informe um celular com DDD, por exemplo (71) 99999-0000.');
    if (await run('send', 'auth.phone_code', () => api.requestPhoneCode(e164), 'Não foi possível enviar o SMS')) setCodeSentTo(e164);
  }

  async function confirmCode() {
    if (!/^\d{6}$/.test(code.trim())) return Alert.alert('Código inválido', 'Digite os 6 números recebidos por SMS.');
    if (await run('confirm', 'auth.phone_verify', () => api.confirmPhoneCode(codeSentTo!, code), 'Código incorreto ou expirado')) {
      setCodeSentTo(null);
      setCode('');
      setPhone('');
      await load();
    }
  }

  async function save() {
    if (!f.name.trim()) return Alert.alert('Informe seu nome');
    const clean = (s: string) => s.trim() || null;
    const ok = await run('save', 'api.profile_save', async () => {
      await api.setDisplayName(f.name.trim());
      await api.saveMyContact({ registration_number: clean(f.registration_number), emergency_name: clean(f.emergency_name),
        emergency_phone: clean(f.emergency_phone), health_notes: clean(f.health_notes) });
    }, 'Não foi possível salvar');
    if (ok) Alert.alert('Cadastro salvo', 'A organização poderá falar com você se precisar.');
  }

  const missing = profileMissing(contact);
  const verified = !!contact?.phone_verified_at;

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {missing.length > 0 && (
            <FadeIn>
              <View style={st.warn}>
                <Ionicons name="alert-circle-outline" size={18} color={c.warn} />
                <View style={{ flex: 1 }}><Body small>Para participar de eventos oficiais falta: <Body small>{missing.join(' e ')}</Body>.</Body></View>
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
              <Title size={14}>Celular</Title>
              {verified && !codeSentTo ? (
                <View style={st.verified}>
                  <Ionicons name="shield-checkmark" size={18} color={c.ok} />
                  <Body>{formatPhoneBR(contact?.phone)} · verificado</Body>
                </View>
              ) : null}
              {!codeSentTo ? (
                <>
                  <Input placeholder={verified ? 'Trocar número: (71) 99999-0000' : '(71) 99999-0000'} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
                  <Button icon="chatbubble-ellipses-outline" variant={verified ? 'secondary' : 'primary'} label="Enviar código por SMS" busy={busy === 'send'} onPress={sendCode} />
                </>
              ) : (
                <>
                  <Body small>Enviamos um código de 6 números para {formatPhoneBR(codeSentTo)}.</Body>
                  <Input placeholder="Código" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={6} />
                  <Button icon="checkmark" haptic="light" label="Confirmar código" busy={busy === 'confirm'} onPress={confirmCode} />
                  <Button variant="secondary" label="Corrigir número" onPress={() => setCodeSentTo(null)} />
                </>
              )}
            </View>
          </FadeIn>

          <FadeIn index={2}>
            <View style={st.card}>
              <Title size={14}>Dados</Title>
              <Input placeholder="Nome completo" value={f.name} onChangeText={set('name')} autoComplete="name" />
              <Input placeholder="Nº da inscrição" value={f.registration_number} onChangeText={set('registration_number')} autoCapitalize="characters" />
              <Title size={14}>Contato de emergência</Title>
              <Input placeholder="Nome do contato" value={f.emergency_name} onChangeText={set('emergency_name')} />
              <Input placeholder="Celular do contato" value={f.emergency_phone} onChangeText={set('emergency_phone')} keyboardType="phone-pad" />
              <Title size={14}>Saúde (opcional)</Title>
              <Input placeholder="Alergias, condições ou medicamentos que a equipe deve saber" value={f.health_notes} onChangeText={set('health_notes')} multiline maxLength={500} style={{ minHeight: 80, textAlignVertical: 'top' }} />
              <Button icon="save-outline" haptic="light" label="Salvar" busy={busy === 'save'} onPress={save} />
            </View>
          </FadeIn>

          <Body muted small>Seus dados são vistos só por você e pela organização, trafegam criptografados (HTTPS) e ficam armazenados criptografados.</Body>
          <Button icon="log-out-outline" variant="secondary" label="Sair da conta" onPress={() => void api.signOut()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: c.surface, borderRadius: radius, padding: 16, gap: 10, borderWidth: 1, borderColor: c.line, ...shadow },
  avatar: { width: 112, height: 112, borderRadius: 56, backgroundColor: c.sand, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 3, borderColor: c.surface, ...shadow },
  avatarImg: { width: 112, height: 112 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warn: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.surface, borderRadius: radius, padding: 12, borderLeftWidth: 3, borderLeftColor: c.warn, borderWidth: 1, borderColor: c.line },
});
