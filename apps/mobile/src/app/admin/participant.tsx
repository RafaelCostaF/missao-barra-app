import { kmBR, plural } from '@/lib/fmt';
import { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  fmtDuration, formatPhoneBR, getSignalState, LOW_BATTERY, mapsLink, SIGNAL_LABEL, telLink, whatsappLink,
  type Alert, type Contact, type LiveParticipant, type ParticipantSummary,
} from '@mb/core';
import { Body, Screen, SignalBadge, Title } from '@/components/ui';
import { act, Card, confirm, open, SmallButton } from '@/components/admin/kit';
import { ago, ALERT_LABEL, EVENT_LABEL, hhmm } from '@/components/admin/labels';
import { useNow } from '@/hooks/useNow';
import { api } from '@/lib/services';
import { c, font } from '@/theme';

/** Uma pessoa dentro de um evento: contato, situação agora e linha do tempo (auditoria). */
export default function Participant() {
  const { session: sessionId, user } = useLocalSearchParams<{ session: string; user: string }>();
  const now = useNow();
  const [p, setP] = useState<LiveParticipant | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [report, setReport] = useState<ParticipantSummary | undefined>();
  const [events, setEvents] = useState<{ event: string; actor: string | null; at: string }[]>([]);

  const load = useCallback(async () => {
    const [live, al, rep, tl] = await Promise.all([api.live(sessionId), api.alerts(sessionId), api.report(sessionId).catch(() => []), api.timeline(sessionId, user)]);
    setP(live.find((x) => x.user_id === user) ?? null);
    setAlerts(al.filter((a) => a.user_id === user));
    setReport(rep.find((r) => r.user_id === user));
    setEvents(tl);
  }, [sessionId, user]);
  useFocusEffect(useCallback(() => void load().catch(() => undefined), [load]));
  useEffect(() => {
    void api.contactOf(user).then(async (ct) => {
      setContact(ct);
      if (ct?.photo_path) setPhoto(await api.photoUrl(ct.photo_path).catch(() => null));
    }).catch(() => undefined);
  }, [user]);

  if (!p) return <Screen><Body muted>Carregando…</Body></Screen>;
  const s = getSignalState(p as never, now);
  const items = [
    ...events.map((e) => ({ at: e.at, color: c.inkSoft, text: EVENT_LABEL[e.event] ?? e.event, note: e.actor && e.actor !== user ? 'pela organização' : '' })),
    ...(report?.passages ?? []).map((x) => ({ at: x.at, color: c.orange, text: `Passou por ${x.name} (km ${x.km})`, note: `+${fmtDuration(x.elapsed_s)}` })),
    ...alerts.flatMap((a) => [
      { at: a.created_at, color: a.type === 'emergency' ? c.danger : c.warn, text: ALERT_LABEL[a.type], note: '' },
      ...(a.resolved_at ? [{ at: a.resolved_at, color: c.ok, text: `${ALERT_LABEL[a.type]} resolvido`, note: `em ${fmtDuration((Date.parse(a.resolved_at) - Date.parse(a.created_at)) / 1000)}` }] : []),
    ]),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const openAlerts = alerts.filter((a) => !a.resolved_at);

  return (
    <Screen>
      <Stack.Screen options={{ title: p.display_name }} />
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
        <View style={st.head}>
          {photo ? <Image source={{ uri: photo }} style={st.avatar} accessibilityLabel={`Foto de ${p.display_name}`} /> : <View style={[st.avatar, st.noPhoto]}><Ionicons name="person" size={34} color={c.inkSoft} /></View>}
          <View style={{ flex: 1, gap: 4 }}>
            <Title size={18}>{p.display_name}</Title>
            <Body muted small>Inscrição {contact?.registration_number ?? 'não informada'}</Body>
            <SignalBadge state={s} />
          </View>
        </View>

        {openAlerts.map((a) => (
          <Card key={a.id} title={`${ALERT_LABEL[a.type]} aberto · ${hhmm(a.created_at)}`}>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {a.lat != null && <SmallButton icon="map-outline" label="Posição do alerta" onPress={() => open(mapsLink(a.lat!, a.lng!))} />}
              <SmallButton icon="checkmark" label="Resolvido" tone="ok" onPress={() => void act('admin.resolve_alert', () => api.resolveAlert(a.id)).then(load)} />
            </View>
          </Card>
        ))}

        <SmallButton icon="chatbubbles-outline" label="Conversa de ajuda" tone="primary" onPress={() => router.push(`/admin/chat?session=${sessionId}&user=${user}`)} />

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
          <Body small>Emergência: {contact?.emergency_phone ? `${contact.emergency_name ?? '—'} · ${contact.emergency_phone}` : 'não informado'}</Body>
          {contact?.emergency_phone && <SmallButton icon="call-outline" label="Ligar para contato de emergência" onPress={() => open(telLink(contact.emergency_phone!))} />}
          {contact?.health_notes && <View style={st.health}><Body small>{contact.health_notes}</Body></View>}
        </Card>

        <Card title="Agora">
          <Body small>{SIGNAL_LABEL[s]} · última posição {hhmm(p.last_at)} ({ago(p.last_at, now)})</Body>
          <Body small>{kmBR(p.distance_m)} km · {plural(report?.passages.length ?? 0, 'ponto de apoio', 'pontos de apoio')}</Body>
          <Body small>Bateria: <Text style={p.battery != null && p.battery <= LOW_BATTERY ? { color: c.danger, fontFamily: font.bold } : undefined}>{p.battery != null ? `${p.battery}%` : 'sem informação'}</Text></Body>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {p.last_lat != null && <SmallButton icon="map-outline" label="Ver no mapa do evento" tone="primary" onPress={() => router.push(`/admin/event/${sessionId}?tab=monitor&focus=${user}`)} />}
            {p.last_lat != null && <SmallButton icon="navigate-outline" label="Google Maps" onPress={() => open(mapsLink(p.last_lat!, p.last_lng!))} />}
            {p.status === 'tracking' && (
              <SmallButton icon="stop-circle-outline" label="Finalizar participação" tone="danger" onPress={() => confirm(
                `Finalizar a participação de ${p.display_name}?`, 'Use em desistência ou quando a pessoa avisar que encerrou.', 'Finalizar',
                () => void act('admin.finish_for', () => api.finishFor(sessionId, user), { session_id: sessionId }).then(load), true)} />
            )}
          </View>
        </Card>

        <Card title="Linha do tempo">
          {!items.length && <Body muted small>Sem registros ainda.</Body>}
          {items.map((i, n) => (
            <View key={n} style={st.tl}>
              <View style={[st.dot, { backgroundColor: i.color }]} />
              <Body small><Text style={{ color: c.inkSoft }}>{hhmm(i.at)}</Text> {i.text}{i.note ? <Text style={{ color: c.inkSoft }}> · {i.note}</Text> : null}</Body>
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  avatar: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: c.surface },
  noPhoto: { backgroundColor: c.sand, alignItems: 'center', justifyContent: 'center' },
  big: { fontFamily: font.display, fontSize: 20, color: c.charcoal },
  health: { backgroundColor: '#FFF8E6', borderLeftWidth: 3, borderLeftColor: c.warn, padding: 8, borderRadius: 4 },
  tl: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
