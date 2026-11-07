import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { getSignalState, nextCheckpoint, type TrackerState } from '@mb/core';
import { Body, Button, Screen, SignalBadge, Title } from '@/components/ui';
import { LiveMap } from '@/components/LiveMap';
import { useLiveSession } from '@/hooks/useLiveSession';
import { useNow } from '@/hooks/useNow';
import { useKeepAwake } from 'expo-keep-awake';
import { backgroundSupported, hasBackgroundPermission } from '@/lib/location';
import { api, logContext, logger, tracker } from '@/lib/services';

const km = (m: number) => `${(m / 1000).toFixed(1).replace('.', ',')} km`;

/** Tela única de monitoramento: evento oficial e corrida privada só diferem nos botões disponíveis. */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, participants, checkpoints, alerts, reload } = useLiveSession(id);
  const now = useNow();
  const [me, setMe] = useState('');
  const [consent, setConsent] = useState(false);
  const [trackerState, setTrackerState] = useState<TrackerState>(tracker.state);
  const [busy, setBusy] = useState(false);
  const [noBackground, setNoBackground] = useState(false);

  useEffect(() => void api.me().then(setMe), []);
  useEffect(() => tracker.subscribe(setTrackerState), []);
  useEffect(() => {
    logContext.session_id = id;
    return () => void (logContext.session_id = undefined);
  }, [id]);

  if (!session) return <Screen><Body muted>Carregando…</Body></Screen>;

  const mine = participants.find((p) => p.user_id === me);
  const official = session.kind === 'official';
  const isOwner = session.owner_id === me;
  const signal = mine ? getSignalState(mine as never, now) : 'not_started';
  const tracking = mine?.status === 'tracking';
  const next = tracking ? nextCheckpoint(checkpoints, mine!.distance_m) : null;
  const others = participants.filter((p) => p.user_id !== me && ['accepted', 'tracking', 'finished'].includes(p.status));
  const openAlerts = alerts.filter((a) => !a.resolved_at);

  async function act(name: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await logger.timed(name, fn, { session_id: id });
      await reload();
    } catch (e) {
      Alert.alert('Algo deu errado', 'Tente de novo. Se continuar, avise a organização.');
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setBusy(true);
    if (official && !mine) await logger.timed('api.join_event', () => api.joinEvent(id)).catch(() => undefined);
    const result = await tracker.start(id);
    setBusy(false);
    if (result === 'permission_denied')
      Alert.alert('Localização negada', 'Sem permissão de localização não é possível acompanhar seu percurso. Ative nas configurações do aparelho.');
    if (result === 'error') Alert.alert('Não foi possível iniciar', 'Verifique sua internet e tente novamente.');
    setNoBackground(!(await hasBackgroundPermission()));
    void reload();
  }

  function confirmAlert(type: 'help' | 'emergency') {
    const text = type === 'emergency'
      ? 'A equipe de apoio receberá sua última localização. Em risco de vida, ligue 192 (SAMU) ou 193.'
      : official ? 'A equipe de apoio receberá seu pedido e sua última localização.' : 'Seus amigos na corrida serão avisados.';
    Alert.alert(type === 'emergency' ? 'Acionar EMERGÊNCIA?' : 'Pedir ajuda?', text, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', style: 'destructive', onPress: () => act(`alert.${type}`, () => api.raiseAlert(id, type)) },
    ]);
  }

  function finish() {
    Alert.alert('Finalizar participação?', 'Sua localização deixará de ser compartilhada.', [
      { text: 'Continuar', style: 'cancel' },
      { text: 'Finalizar', onPress: () => act('session.finish', () => tracker.finish()) },
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <Title>{session.name}</Title>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <SignalBadge state={signal} />
          {tracking && <Body muted>Você está sendo monitorado</Body>}
        </View>

        <View style={{ height: 300 }}>
          <LiveMap participants={participants} checkpoints={checkpoints} now={now} />
        </View>

        {tracking && (
          <Body>
            Percorrido: {km(mine!.distance_m)}
            {next ? ` · Próximo apoio: ${next.name} (km ${next.km})` : ''}
          </Body>
        )}
        {tracking && !backgroundSupported && <KeepAwake />}
        {tracking && !backgroundSupported && <Body muted>⚠️ Modo de teste (Expo Go): mantenha o app aberto. A tela ficará ligada enquanto você é monitorado.</Body>}
        {noBackground && backgroundSupported && tracking && <Body muted>⚠️ Permita localização "Sempre" para continuar com a tela bloqueada.</Body>}
        {trackerState === 'finished' && mine?.status === 'finished' && <Body>Participação finalizada. Sua localização não está mais sendo compartilhada.</Body>}

        {!official && others.length > 0 && <Body muted>Na corrida: {others.map((o) => o.display_name).join(', ')}</Body>}
        {openAlerts.filter((a) => a.user_id !== me).map((a) => (
          <Body key={a.id}>🚨 {participants.find((p) => p.user_id === a.user_id)?.display_name ?? 'Alguém'} pediu ajuda às {new Date(a.created_at).toLocaleTimeString('pt-BR')}</Body>
        ))}

        {/* Criador da corrida privada controla início/fim para todos. */}
        {!official && isOwner && session.status === 'draft' && <Button label="Iniciar corrida para todos" busy={busy} onPress={() => act('race.go_live', () => api.setStatus(id, 'live'))} />}

        {!tracking && mine?.status !== 'finished' && session.status === 'live' && (
          consent ? (
            <Button label={official ? 'Iniciar percurso' : 'Entrar na corrida'} busy={busy} onPress={start} />
          ) : (
            <View style={{ gap: 8 }}>
              <Body>
                Ao iniciar, sua localização será enviada {official ? 'à equipe de apoio da Missão Barra' : 'aos amigos que aceitaram esta corrida'} a cada
                ~20 segundos, inclusive com a tela bloqueada, até você tocar em Finalizar.
              </Body>
              <Button label="Entendi, quero compartilhar" onPress={() => setConsent(true)} />
            </View>
          )
        )}
        {session.status !== 'live' && session.status !== 'ended' && !(isOwner && !official) && <Body muted>Aguardando a largada. O botão de início aparece quando o percurso for aberto.</Body>}
        {session.status === 'ended' && <Body muted>Esta sessão foi encerrada.</Body>}

        {tracking && (
          <View style={{ gap: 8 }}>
            {official && <Button variant="danger" label="Emergência" onPress={() => confirmAlert('emergency')} />}
            <Button variant="secondary" label="Preciso de ajuda" onPress={() => confirmAlert('help')} />
            <Button variant="secondary" label="Finalizar participação" busy={busy} onPress={finish} />
          </View>
        )}
        {!official && isOwner && session.status === 'live' && (
          <Button variant="secondary" label="Encerrar para todos" onPress={() => act('race.end', async () => {
            if (tracking) await tracker.finish();
            await api.setStatus(id, 'ended');
          })} />
        )}
        <Body muted>O app não substitui equipe médica nem garante resgate.</Body>
      </ScrollView>
    </Screen>
  );
}

/** No Expo Go o GPS só funciona com o app aberto: impede a tela de apagar durante o rastreio. */
function KeepAwake() {
  useKeepAwake();
  return null;
}
