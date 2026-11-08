import { kmBR } from '@/lib/fmt';
import { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatPhoneBR, telLink, whatsappLink, type Api, type Contact, type PersonRow, type StravaActivity } from '@mb/core';
import { StravaActivities, StravaButton } from '@/components/Strava';
import { Body, Screen, Title } from '@/components/ui';
import { act, Card, confirm, Kpis, ListItem, open, Pill, SmallButton } from '@/components/admin/kit';
import { STATUS_LABEL } from '@/components/admin/labels';
import { api } from '@/lib/services';
import { c, font } from '@/theme';

type History = Awaited<ReturnType<Api['personHistory']>>;
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const PART: Record<string, string> = { accepted: 'Inscrito', tracking: 'Em percurso', finished: 'Finalizou' };

/** Perfil completo de uma conta para a organização: contato, números, participações e permissão. */
export default function PersonProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [p, setP] = useState<PersonRow | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [history, setHistory] = useState<History>([]);
  const [me, setMe] = useState('');
  const [strava, setStrava] = useState<StravaActivity[] | null>(null);

  const load = useCallback(async () => {
    const [rows, h] = await Promise.all([api.people(), api.personHistory(id)]);
    const row = rows.find((r) => r.id === id) ?? null;
    setP(row);
    setHistory(h);
    // Só aparece se a pessoa liberou o Strava para a organização (RLS garante).
    setStrava(row?.strava_km_30d != null ? await api.stravaActivities(id, 10) : null);
  }, [id]);
  useFocusEffect(useCallback(() => void load().catch(() => undefined), [load]));
  useEffect(() => {
    void api.me().then(setMe);
    void api.contactOf(id).then(async (ct) => {
      setContact(ct);
      if (ct?.photo_path) setPhoto(await api.photoUrl(ct.photo_path).catch(() => null));
    }).catch(() => undefined);
  }, [id]);

  if (!p) return <Screen><Body muted>Carregando…</Body></Screen>;
  const isAdmin = p.role === 'admin';

  function toggleAdmin() {
    confirm(
      isAdmin ? `Retirar organizador de ${p!.display_name}?` : `Tornar ${p!.display_name} organizador?`,
      isAdmin ? 'A pessoa perde acesso a localização, contatos e logs.' : 'A pessoa passa a ver localização, contatos e logs de todos os eventos oficiais.',
      isAdmin ? 'Retirar' : 'Confirmar',
      () => void act('admin.set_admin', () => api.setAdmin(p!.id, !isAdmin)).then(load),
      isAdmin,
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: p.display_name }} />
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
        <View style={st.head}>
          {photo ? <Image source={{ uri: photo }} style={st.avatar} /> : <View style={[st.avatar, st.noPhoto]}><Ionicons name="person" size={34} color={c.inkSoft} /></View>}
          <View style={{ flex: 1, gap: 4 }}>
            <Title size={18}>{p.display_name}</Title>
            <Body muted small>{p.email}</Body>
            <Pill text={isAdmin ? 'Organizador' : 'Participante'} color={isAdmin ? c.charcoal : c.inkSoft} />
          </View>
        </View>

        <Kpis items={[
          { label: 'Eventos', value: p.events_started },
          { label: 'Corridas', value: p.races_started },
          { label: 'km', value: Number(p.total_km).toFixed(0) },
          { label: 'Chamados', value: p.calls, tone: p.calls ? 'warn' : undefined },
          { label: 'Inscrições', value: p.events_joined },
        ]} />

        <Card title="Contato">
          {contact?.phone ? (
            <>
              <Text style={st.big}>{formatPhoneBR(contact.phone)}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <SmallButton icon="call-outline" label="Ligar" tone="primary" onPress={() => open(telLink(contact.phone!))} />
                <SmallButton icon="logo-whatsapp" label="WhatsApp" tone="ok" onPress={() => open(whatsappLink(contact.phone!))} />
              </View>
            </>
          ) : <Body muted small>Celular não informado.</Body>}
          <Body small>Inscrição: {contact?.registration_number ?? '—'} · Foto: {p.has_photo ? 'sim' : 'não'}</Body>
          <Body small>Emergência: {contact?.emergency_phone ? `${contact.emergency_name ?? '—'} · ${contact.emergency_phone}` : '—'}</Body>
          {contact?.health_notes && <View style={st.health}><Body small>{contact.health_notes}</Body></View>}
        </Card>

        <Card title="Acesso">
          <Body small>Conta criada em {fmtDate(p.created_at)} · último login {p.last_sign_in_at ? new Date(p.last_sign_in_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</Body>
          {p.id !== me
            ? <SmallButton icon={isAdmin ? 'remove-circle-outline' : 'shield-checkmark-outline'} label={isAdmin ? 'Retirar organizador' : 'Tornar organizador'} tone={isAdmin ? 'danger' : 'primary'} onPress={toggleAdmin} />
            : <Body muted small>Esta é a sua conta.</Body>}
        </Card>

        {p.strava_url ? (
          <Card title="Strava (compartilhado com a organização)">
            <StravaButton label="Ver perfil no Strava" onPress={() => open(p.strava_url!)} />
            {/* Treinos só existem com a API do Strava (paga); sem ela, apenas o link. */}
            {strava && <StravaActivities activities={strava} max={10} />}
          </Card>
        ) : null}

        <Card title={`Participações (${history.length})`}>
          {!history.length && <Body muted small>Nenhuma participação ainda.</Body>}
          {history.map((h) => (
            <ListItem key={h.session_id} title={h.name}
              subtitle={`${fmtDate(h.starts_at)} · ${PART[h.status] ?? h.status} · ${kmBR(h.distance_m)} km · evento ${STATUS_LABEL[h.session_status].toLowerCase()}${h.is_test ? ' · teste' : ''}`}
              onPress={h.kind === 'official' ? () => router.push(`/admin/participant?session=${h.session_id}&user=${p.id}`) : undefined} />
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  avatar: { width: 76, height: 76, borderRadius: 38 },
  noPhoto: { backgroundColor: c.sand, alignItems: 'center', justifyContent: 'center' },
  big: { fontFamily: font.display, fontSize: 20, color: c.charcoal },
  health: { backgroundColor: '#FFF8E6', borderLeftWidth: 3, borderLeftColor: c.warn, padding: 8, borderRadius: 4 },
});
