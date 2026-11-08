import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getSignalState, profileMissing, type TrackerState } from '@mb/core';
import { Body, Button, FadeIn, Screen, SignalBadge, Title } from '@/components/ui';
import { c, radius, shadow } from '@/theme';
import { LiveMap } from '@/components/LiveMap';
import { RunPanel } from '@/components/RunPanel';
import { useLiveSession } from '@/hooks/useLiveSession';
import { useNow } from '@/hooks/useNow';
import { useKeepAwake } from 'expo-keep-awake';
import { backgroundSupported, hasBackgroundPermission } from '@/lib/location';
import { api, logContext, logger, tracker } from '@/lib/services';

/** Tela única de monitoramento: evento oficial e corrida privada só diferem nos botões disponíveis. */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, participants, checkpoints, alerts, reload } = useLiveSession(id);
  const now = useNow(5_000); // métricas do corredor atualizam a cada 5 s
  const [me, setMe] = useState('');
  const [consent, setConsent] = useState(false);
  const [trackerState, setTrackerState] = useState<TrackerState>(tracker.state);
  const [busy, setBusy] = useState(false);
  const [noBackground, setNoBackground] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => void api.me().then(setMe), []);
  // Ao voltar do Perfil, o lembrete some sem recarregar a tela.
  useFocusEffect(useCallback(() => void api.myContact().then((ct) => setMissing(profileMissing(ct))).catch(() => undefined), []));
  useEffect(() => tracker.subscribe(setTrackerState), []);
  useEffect(() => {
    logContext.session_id = id;
    return () => void (logContext.session_id = undefined);
  }, [id]);

  if (!session) return <Screen><Body muted>Carregando percurso…</Body></Screen>;

  const mine = participants.find((p) => p.user_id === me);
  const official = session.kind === 'official';
  const isOwner = session.owner_id === me;
  const signal = mine ? getSignalState(mine as never, now) : 'not_started';
  const tracking = mine?.status === 'tracking';
  const others = participants.filter((p) => p.user_id !== me && ['accepted', 'tracking', 'finished'].includes(p.status));
  const openAlerts = alerts.filter((a) => !a.resolved_at);

  async function act(name: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await logger.timed(name, fn, { session_id: id });
      await reload();
    } catch {
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
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <View style={st.map}>
            <LiveMap participants={participants} checkpoints={checkpoints} now={now} />
          </View>
        </FadeIn>

        <FadeIn index={1}>
          <View style={st.card}>
            <Title size={18}>{session.name}</Title>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <SignalBadge state={signal} />
              {tracking && <Body muted small>Você está sendo monitorado</Body>}
            </View>
          </View>
        </FadeIn>

        {mine && (tracking || mine.status === 'finished') && (
          <RunPanel sessionId={id} me={mine} participants={participants} checkpoints={checkpoints} now={now} />
        )}

        {tracking && !backgroundSupported && <KeepAwake />}
        {tracking && !backgroundSupported && <Notice icon="phone-portrait-outline" text="Modo de teste (Expo Go): mantenha o app aberto. A tela fica ligada enquanto você é monitorado." />}
        {noBackground && backgroundSupported && tracking && <Notice icon="lock-closed-outline" text='Permita localização "Sempre" para continuar com a tela bloqueada.' />}
        {trackerState === 'finished' && mine?.status === 'finished' && <Notice icon="checkmark-circle-outline" tone="ok" text="Participação finalizada. Sua localização não está mais sendo compartilhada." />}
        {openAlerts.filter((a) => a.user_id !== me).map((a) => (
          <Notice key={a.id} icon="alert-circle-outline" tone="danger"
            text={`${participants.find((p) => p.user_id === a.user_id)?.display_name ?? 'Alguém'} pediu ajuda às ${new Date(a.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`} />
        ))}
        {!official && others.length > 0 && <Body muted small>Na corrida: {others.map((o) => o.display_name).join(', ')}</Body>}

        {/* Criador da corrida privada controla início/fim para todos. */}
        {!official && isOwner && session.status === 'draft' && <Button icon="flag-outline" haptic="light" label="Iniciar corrida para todos" busy={busy} onPress={() => act('race.go_live', () => api.setStatus(id, 'live'))} />}

        {/* Evento oficial exige foto + celular verificado (o banco também bloqueia). */}
        {missing.length > 0 && !tracking && official && (
          <>
            <Notice icon="person-circle-outline" tone="danger" text={`Para participar, complete seu cadastro: falta ${missing.join(' e ')}.`} />
            <Button icon="person-circle-outline" label="Completar cadastro" onPress={() => router.push('/cadastro')} />
          </>
        )}
        {!(missing.length > 0 && official) && !tracking && mine?.status !== 'finished' && session.status === 'live' && (
          consent ? (
            <FadeIn><Button icon="navigate" haptic="light" label={official ? 'Iniciar percurso' : 'Entrar na corrida'} busy={busy} onPress={start} /></FadeIn>
          ) : (
            <FadeIn>
              <View style={st.card}>
                <Body>
                  Ao iniciar, sua localização será enviada {official ? 'à equipe de apoio da Missão Barra e aparecerá para os outros participantes do evento (para ver quem corre perto)' : 'aos amigos que aceitaram esta corrida'} a cada
                  ~20 segundos até você tocar em Finalizar.
                </Body>
                <Button icon="shield-checkmark-outline" label="Entendi, quero compartilhar" onPress={() => setConsent(true)} />
              </View>
            </FadeIn>
          )
        )}
        {session.status !== 'live' && session.status !== 'ended' && !(isOwner && !official) && <Notice icon="time-outline" text="Aguardando a largada. O botão de início aparece quando o percurso for aberto." />}
        {session.status === 'ended' && <Notice icon="flag-outline" text="Esta sessão foi encerrada." />}

        {tracking && (
          <FadeIn index={2}>
            <View style={{ gap: 8 }}>
              {official && <Button icon="warning" variant="danger" haptic="heavy" label="Emergência" onPress={() => confirmAlert('emergency')} />}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Button icon="hand-left-outline" variant="secondary" haptic="light" label="Ajuda" onPress={() => confirmAlert('help')} /></View>
                <View style={{ flex: 1 }}><Button icon="stop-circle-outline" variant="secondary" label="Finalizar" busy={busy} onPress={finish} /></View>
              </View>
            </View>
          </FadeIn>
        )}
        {!official && isOwner && session.status === 'live' && (
          <Button variant="secondary" label="Encerrar para todos" onPress={() => act('race.end', async () => {
            if (tracking) await tracker.finish();
            await api.setStatus(id, 'ended');
          })} />
        )}
        <Body muted small>O app não substitui equipe médica nem garante resgate.</Body>
      </ScrollView>
    </Screen>
  );
}

function Notice({ icon, text, tone }: { icon: keyof typeof Ionicons.glyphMap; text: string; tone?: 'ok' | 'danger' }) {
  const color = tone === 'ok' ? c.ok : tone === 'danger' ? c.danger : c.inkSoft;
  return (
    <FadeIn>
      <View style={[st.notice, { borderLeftColor: color }]}>
        <Ionicons name={icon} size={18} color={color} />
        <View style={{ flex: 1 }}><Body small>{text}</Body></View>
      </View>
    </FadeIn>
  );
}

const st = StyleSheet.create({
  map: { height: 280, borderRadius: radius, overflow: 'hidden', borderWidth: 1, borderColor: c.line },
  card: { backgroundColor: c.surface, borderRadius: radius, padding: 16, gap: 12, borderWidth: 1, borderColor: c.line, ...shadow },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.surface, borderRadius: radius, padding: 12, borderLeftWidth: 3, borderWidth: 1, borderColor: c.line },
});

/** No Expo Go o GPS só funciona com o app aberto: impede a tela de apagar durante o rastreio. */
function KeepAwake() {
  useKeepAwake();
  return null;
}
