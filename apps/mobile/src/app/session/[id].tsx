import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getSignalState, lineToPoints, profileMissing, type TrackerState } from '@mb/core';
import { Body, Button, FadeIn, Screen, StatusDot } from '@/components/ui';
import { c, font, radius, shadow } from '@/theme';
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
  const [missing, setMissing] = useState<string[]>([]);
  const [showMap, setShowMap] = useState<boolean | null>(null);
  const [holdHint, setHoldHint] = useState(false);

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
  // Mapa geral aberto por padrão fora do percurso (correndo, o painel mostra o mapa de corredor).
  const mapOpen = showMap ?? true;
  // Caminho real pelas ruas (gerado ao salvar o percurso); sem ele, linha reta entre os pontos.
  const path = lineToPoints(session.route);

  /** Executa e recarrega; devolve false (e avisa) se falhou. */
  async function act(name: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await logger.timed(name, fn, { session_id: id });
      await reload();
      return true;
    } catch {
      Alert.alert('Algo deu errado', 'Tente de novo. Se continuar, avise a organização.');
      return false;
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
    // Uma vez, só se faltar: sem "Sempre", o envio pausa com a tela bloqueada (no Expo Go não se aplica).
    if (result === 'tracking' && backgroundSupported && !(await hasBackgroundPermission()))
      Alert.alert('Localização com a tela bloqueada', 'Para continuar enviando sua localização com a tela bloqueada, permita "Sempre" nos Ajustes do celular.');
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

  // Emergência: segurar 1 s substitui a caixa de confirmação (mais rápido e sem toque acidental).
  async function raiseEmergency() {
    setHoldHint(false);
    if (!(await act('alert.emergency', () => api.raiseAlert(id, 'emergency')))) return;
    Alert.alert('Emergência enviada', 'A equipe de apoio recebeu seu pedido e sua última localização. Em risco de vida, ligue 192 (SAMU) ou 193.');
  }

  function finish() {
    Alert.alert('Finalizar participação?', 'Sua localização deixará de ser compartilhada.', [
      { text: 'Continuar', style: 'cancel' },
      { text: 'Finalizar', onPress: () => act('session.finish', () => tracker.finish()) },
    ]);
  }

  return (
    <Screen>
      {/* Cabeçalho: "Percurso" com o nome do evento como subtítulo; o selo de sinal explica o monitoramento. */}
      <Stack.Screen options={{
        headerTitle: () => (
          <View style={{ alignItems: 'center', maxWidth: 230 }}>
            <Text style={st.hTitle}>Percurso</Text>
            <Text style={st.hSub} numberOfLines={1}>{session.name}</Text>
          </View>
        ),
        headerRight: () => (mine ? <StatusDot state={signal} who={official ? 'a organização' : 'quem está nesta corrida com você'} /> : null),
      }} />
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>

        {/* Correndo, o que importa vem primeiro: pace, distância, próximo ponto. Mapa sob demanda. */}
        {mine && (tracking || mine.status === 'finished') && (
          <RunPanel sessionId={id} me={mine} participants={participants} checkpoints={checkpoints} now={now} path={path} />
        )}

        {/* Correndo, o mapa de corredor fica dentro do painel; antes/depois, o mapa geral do percurso. */}
        {!tracking && (
        <Pressable onPress={() => setShowMap((v) => !v)} style={st.mapToggle} accessibilityRole="button" accessibilityState={{ expanded: mapOpen }}>
          <Ionicons name={mapOpen ? 'chevron-up' : 'map-outline'} size={16} color={c.charcoal} />
          <Text style={st.mapToggleText}>{mapOpen ? 'Esconder mapa' : 'Ver mapa'}</Text>
        </Pressable>
        )}
        {!tracking && mapOpen && (
          <FadeIn>
            <View style={st.map}>
              <LiveMap participants={participants} checkpoints={checkpoints} now={now} path={path} />
            </View>
          </FadeIn>
        )}

        {tracking && !backgroundSupported && <KeepAwake />}
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
                <Body muted small>O app não substitui equipe médica nem garante resgate.</Body>
                <Button icon="shield-checkmark-outline" label="Entendi, quero compartilhar" onPress={() => setConsent(true)} />
              </View>
            </FadeIn>
          )
        )}
        {session.status !== 'live' && session.status !== 'ended' && !(isOwner && !official) && <Notice icon="time-outline" text="Aguardando a largada. O botão de início aparece quando o percurso for aberto." />}
        {session.status === 'ended' && <Notice icon="flag-outline" text="Esta sessão foi encerrada." />}

        {!official && isOwner && session.status === 'live' && (
          <Button variant="secondary" label="Encerrar para todos" onPress={() => act('race.end', async () => {
            if (tracking) await tracker.finish();
            await api.setStatus(id, 'ended');
          })} />
        )}
      </ScrollView>

      {/* Sempre à mão, sem rolar: emergência, ajuda e finalizar. */}
      {tracking && (
        <View style={st.actionBar}>
          {/* Lado a lado: ocupa uma faixa só. Emergência maior e vermelha, dispara segurando 1 s. */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {official && (
              <View style={{ flex: 1.4 }}>
                <HoldButton label="Emergência" hint="Segure 1 s para acionar" onHold={raiseEmergency} onTap={() => setHoldHint(true)} />
              </View>
            )}
            {/* Evento oficial: ajuda vira conversa com a organização. Corrida entre amigos: avisa os amigos. */}
            <BarButton icon={official ? 'chatbubbles-outline' : 'hand-left-outline'} label="Ajuda" onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (official) router.push(`/help/${id}`);
              else confirmAlert('help');
            }} />
            <BarButton icon="stop-circle-outline" label="Finalizar" busy={busy} onPress={finish} />
          </View>
          {holdHint && official && <Text style={st.holdHint}>Segure o botão por 1 segundo para acionar a emergência.</Text>}
        </View>
      )}
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

/** Botão compacto da barra de ações (ícone em cima, texto embaixo). */
function BarButton({ icon, label, onPress, busy }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [st.barBtn, pressed && { opacity: 0.8 }]}>
      <Ionicons name={icon} size={20} color={c.charcoal} />
      <Text style={st.barText} numberOfLines={1}>{busy ? '…' : label.toUpperCase()}</Text>
    </Pressable>
  );
}

/** Botão que só dispara se segurado (barra enche em 1 s). Toque rápido mostra a dica. */
function HoldButton({ label, hint, onHold, onTap }: { label: string; hint: string; onHold: () => void; onTap: () => void }) {
  const fill = useState(() => new Animated.Value(0))[0];
  const fired = useRef(false);
  const start = () => {
    fired.current = false;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(fill, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: false }).start();
  };
  const stop = () => {
    fill.stopAnimation();
    Animated.timing(fill, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };
  return (
    <Pressable onPressIn={start} onPressOut={stop} delayLongPress={1000}
      onLongPress={() => { fired.current = true; void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); onHold(); }}
      onPress={() => { if (!fired.current) onTap(); }}
      accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint}
      style={st.hold}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#8E1A13', width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      <Ionicons name="warning" size={20} color={c.white} />
      <Text style={st.holdText} numberOfLines={1} adjustsFontSizeToFit>{label.toUpperCase()}</Text>
      <Text style={st.holdSub}>segure 1 s</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  hTitle: { fontFamily: font.display, fontSize: 16, color: c.white },
  hSub: { fontFamily: font.body, fontSize: 11.5, color: c.sand },
  mapToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface },
  mapToggleText: { fontFamily: font.bold, fontSize: 13, color: c.charcoal, textTransform: 'uppercase', letterSpacing: 0.6 },
  actionBar: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.white },
  hold: { height: 64, borderRadius: radius, backgroundColor: c.danger, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, ...shadow },
  holdText: { fontFamily: font.bold, fontSize: 13, color: c.white, letterSpacing: 0.8 },
  holdSub: { fontFamily: font.body, fontSize: 10.5, color: '#FFD9D4' },
  barBtn: { flex: 1, height: 64, borderRadius: radius, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', gap: 2 },
  barText: { fontFamily: font.bold, fontSize: 12, color: c.charcoal, letterSpacing: 0.6 },
  holdHint: { fontFamily: font.bold, fontSize: 12.5, color: c.danger, textAlign: 'center' },
  map: { height: 280, borderRadius: radius, overflow: 'hidden', borderWidth: 1, borderColor: c.line },
  card: { backgroundColor: c.surface, borderRadius: radius, padding: 16, gap: 12, borderWidth: 1, borderColor: c.line, ...shadow },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.surface, borderRadius: radius, padding: 12, borderLeftWidth: 3, borderWidth: 1, borderColor: c.line },
});

/** No Expo Go o GPS só funciona com o app aberto: impede a tela de apagar durante o rastreio. */
function KeepAwake() {
  useKeepAwake();
  return null;
}
