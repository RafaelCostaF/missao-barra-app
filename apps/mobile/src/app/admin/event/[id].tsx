import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SESSION_ACTIONS, type SessionStatus } from '@mb/core';
import { Body, Screen } from '@/components/ui';
import { act, Chips, confirm, Pill, SmallButton } from '@/components/admin/kit';
import { STATUS_LABEL, statusColor } from '@/components/admin/labels';
import { EventAlerts, EventMonitor, EventPeople, EventReport } from '@/components/admin/EventTabs';
import { RouteEditor } from '@/components/admin/RouteEditor';
import { useLiveSession } from '@/hooks/useLiveSession';
import { useNow } from '@/hooks/useNow';
import { api } from '@/lib/services';

const TABS = { monitor: 'Monitoramento', participantes: 'Participantes', alertas: 'Alertas', relatorio: 'Relatório', percurso: 'Percurso' } as const;
type Tab = keyof typeof TABS;

/** Evento oficial para a organização: mesmas abas do painel web. */
export default function AdminEvent() {
  const { id, tab: initial } = useLocalSearchParams<{ id: string; tab?: string }>();
  const [tab, setTab] = useState<Tab>(initial && initial in TABS ? (initial as Tab) : 'monitor');
  const live = useLiveSession(id);
  const now = useNow();
  const { session, alerts, reload } = live;

  if (!session) return <Screen><Body muted>Carregando evento…</Body></Screen>;
  const open = alerts.filter((a) => !a.resolved_at).length;

  function setStatus(to: SessionStatus, label: string) {
    const run = () => void act('admin.set_status', () => api.setStatus(id, to), { session_id: id, to }).then(reload);
    if (to === 'ended') confirm('Encerrar o evento?', 'Finaliza o rastreamento de todos.', 'Encerrar', run, true);
    else confirm(`${label}?`, to === 'published' ? 'O evento passa a aparecer para todos no app.' : to === 'live' ? 'Participantes poderão iniciar o percurso.' : '', label, run);
  }

  // Monitoramento e percurso têm mapa: rolagem própria em cada aba.
  const body = {
    monitor: <EventMonitor sessionId={id} {...live} now={now} />,
    participantes: <EventPeople sessionId={id} {...live} now={now} />,
    alertas: <EventAlerts {...live} />,
    relatorio: <EventReport sessionId={id} {...live} />,
    percurso: <RouteEditor sessionId={id} initial={live.checkpoints} onSaved={live.reloadCheckpoints} />,
  }[tab];

  return (
    <Screen>
      <Stack.Screen options={{ title: session.name }} />
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Pill text={STATUS_LABEL[session.status]} color={statusColor(session.status)} />
          {session.is_test && <Pill text="teste" />}
          {session.starts_at && <Body muted small>{new Date(session.starts_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Body>}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {SESSION_ACTIONS[session.status].map((a) => (
            <SmallButton key={a.to} icon={a.to === 'draft' ? 'arrow-undo-outline' : 'arrow-forward'} label={a.label} tone={a.to === 'draft' ? 'default' : 'primary'} onPress={() => setStatus(a.to, a.label)} />
          ))}
          {session.is_test && (
            <SmallButton icon="trash-outline" label="Apagar teste" tone="danger" onPress={() => confirm('Apagar esta sessão de teste?', 'Todos os dados dela serão apagados.', 'Apagar', () =>
              void act('admin.delete_test', () => api.deleteTestSession(id)).then((r) => r !== undefined && router.back()), true)} />
          )}
        </ScrollView>
        <Chips options={TABS} value={tab} onChange={setTab} counts={open ? { alertas: open } : undefined} hot={['alertas']} />
      </View>
      <View style={{ flex: 1 }}>{body}</View>
    </Screen>
  );
}
