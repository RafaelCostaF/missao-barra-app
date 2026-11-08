import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { type Api, type Session } from '@mb/core';
import { Body, Button, Screen } from '@/components/ui';
import { act, Card, ListItem, Pill, SmallButton } from '@/components/admin/kit';
import { ALERT_LABEL, STATUS_LABEL, statusColor } from '@/components/admin/labels';
import { api, logger, supabase } from '@/lib/services';
import { c } from '@/theme';

type OpenAlert = Awaited<ReturnType<Api['openAlerts']>>[number];

/** Central da organização no app: alertas abertos, eventos e atalhos (mesmo que o painel web). */
export default function AdminHome() {
  const [events, setEvents] = useState<Session[]>([]);
  const [alerts, setAlerts] = useState<OpenAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, a] = await Promise.all([api.allEvents(), api.openAlerts()]);
      setEvents(e);
      setAlerts(a);
    } catch (e) {
      void logger.error('admin.home', e);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));
  useEffect(() => {
    const ch = api.subscribe('admin-home', ['alerts'], () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void load(), 800);
    });
    const poll = setInterval(() => void load(), 30_000);
    return () => {
      clearInterval(poll);
      clearTimeout(timer.current);
      void supabase.removeChannel(ch);
    };
  }, [load]);

  const emergencies = alerts.filter((a) => a.type === 'emergency').length;
  // Arquivados por último.
  const active = [...events].sort((a, b) => Number(a.status === 'archived') - Number(b.status === 'archived'));

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <Card title={alerts.length ? `${alerts.length} alerta${alerts.length > 1 ? 's' : ''} aberto${alerts.length > 1 ? 's' : ''}` : 'Alertas'}
          right={emergencies ? <Pill text={`${emergencies} emergência${emergencies > 1 ? 's' : ''}`} color={c.danger} /> : undefined}>
          {!alerts.length && <Body muted small>Nenhum alerta aberto.</Body>}
          {alerts.map((a) => (
            <View key={a.id} style={{ gap: 6 }}>
              <ListItem accent={a.type === 'emergency' ? c.danger : c.warn}
                title={`${ALERT_LABEL[a.type]} · ${a.profiles?.display_name ?? 'Participante'}`}
                subtitle={`${a.sessions?.name ?? ''} · ${new Date(a.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${a.lat == null ? ' · sem posição' : ''}`}
                onPress={() => router.push(a.type === 'signal_lost' ? `/admin/participant?session=${a.session_id}&user=${a.user_id}` : `/admin/chat?session=${a.session_id}&user=${a.user_id}`)} />
              <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
                <SmallButton icon="checkmark" label="Resolvido" tone="ok" onPress={() => void act('admin.resolve_alert', () => api.resolveAlert(a.id)).then(load)} />
              </View>
            </View>
          ))}
        </Card>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><SmallButton icon="people-outline" label="Pessoas" onPress={() => router.push('/admin/people')} /></View>
          <View style={{ flex: 1 }}><SmallButton icon="shield-outline" label="Equipe" onPress={() => router.push('/admin/staff')} /></View>
          <View style={{ flex: 1 }}><SmallButton icon="document-text-outline" label="Logs" onPress={() => router.push('/admin/logs')} /></View>
        </View>

        <Button icon="add-circle-outline" label="Novo evento oficial" onPress={() => router.push('/admin/event-new')} />

        <Card title={`Eventos (${events.length})`}>
          {!active.length && <Body muted small>Nenhum evento. Crie o primeiro acima.</Body>}
          {active.map((e) => (
            <ListItem key={e.id} title={e.name}
              subtitle={`${e.starts_at ? new Date(e.starts_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sem data'}${e.is_test ? ' · teste' : ''}`}
              right={<Pill text={STATUS_LABEL[e.status]} color={statusColor(e.status)} />}
              onPress={() => router.push(`/admin/event/${e.id}`)} />
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}
