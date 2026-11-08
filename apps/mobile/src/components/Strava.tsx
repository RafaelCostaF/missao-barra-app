import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  fmtDuration, parseStravaProfile, sportLabel, STRAVA_ORANGE, stravaActivityUrl, stravaLink, stravaSummary, type StravaAccount, type StravaActivity,
} from '@mb/core';
import { Body, Input } from '@/components/ui';
import { api, logger } from '@/lib/services';
import { c, font, radius, shadow } from '@/theme';

const openUrl = (url: string) => void Linking.openURL(url).catch(() => undefined);

/** Exigência da marca Strava sempre que dados do Strava aparecem. */
export function PoweredByStrava() {
  return <Text style={st.powered}>Powered by <Text style={{ color: STRAVA_ORANGE, fontFamily: font.bold }}>Strava</Text></Text>;
}

/** Botão no laranja do Strava. */
export function StravaButton({ label, onPress, busy, icon = 'open-outline' }: { label: string; onPress: () => void; busy?: boolean; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [st.btn, pressed && { opacity: 0.85 }]}>
      {busy ? <ActivityIndicator color="#fff" /> : (
        <>
          <Ionicons name={icon} size={17} color="#fff" />
          <Text style={st.btnText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Resumo de 30 dias + atividades recentes, cada uma com "Ver no Strava". */
export function StravaActivities({ activities, max = 5 }: { activities: StravaActivity[]; max?: number }) {
  const sum = stravaSummary(activities);
  return (
    <View style={{ gap: 8 }}>
      <View style={st.kpis}>
        <Kpi value={String(sum.count)} label="a pé · 30 dias" />
        <Kpi value={`${sum.km.toString().replace('.', ',')}`} label="km · 30 dias" />
        <Kpi value={sum.pace ?? '—'} label="ritmo min/km" />
      </View>
      {!activities.length && <Body muted small>Nenhuma atividade sincronizada ainda.</Body>}
      {activities.slice(0, max).map((a) => (
        <Pressable key={a.id} onPress={() => openUrl(stravaActivityUrl(a.id))} style={st.act} accessibilityRole="link" accessibilityLabel={`Ver ${a.name ?? 'atividade'} no Strava`}>
          <View style={{ flex: 1 }}>
            <Text style={st.actName} numberOfLines={1}>{a.name ?? sportLabel(a.sport_type)}</Text>
            <Text style={st.actSub}>
              {new Date(a.start_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {sportLabel(a.sport_type)} · {(a.distance_m / 1000).toFixed(1).replace('.', ',')} km · {fmtDuration(a.moving_time_s)}
            </Text>
          </View>
          <Text style={st.view}>Ver no Strava</Text>
        </Pressable>
      ))}
      <PoweredByStrava />
    </View>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <View style={st.kpi}>
      <Text style={st.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={st.kpiLabel}>{label}</Text>
    </View>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Body small>{label}</Body>
        <Text style={st.hint}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: STRAVA_ORANGE }} accessibilityLabel={label} />
    </View>
  );
}

/**
 * Cartão do Perfil. Grátis: a pessoa cola o link do próprio perfil Strava e escolhe quem vê (opt-in).
 * Se um dia a API do Strava (paga) for configurada no servidor, aparece também "Conectar" com importação de treinos.
 */
export function StravaCard() {
  const [account, setAccount] = useState<StravaAccount | null | undefined>(undefined);
  const [acts, setActs] = useState<StravaActivity[]>([]);
  const [apiOn, setApiOn] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [a, on] = await Promise.all([api.stravaAccount(), api.stravaConfigured()]);
    setAccount(a);
    setApiOn(on);
    setLink(a?.profile_url ?? '');
    setActs(a?.athlete_id != null ? await api.stravaActivities() : []);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial; estado só muda após await
  useEffect(() => void load().catch((e) => logger.error('strava.load', e)), [load]);

  async function step(key: string, event: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await logger.timed(event, fn);
    } catch (e) {
      Alert.alert('Strava', `Não foi possível concluir: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const saveLink = () => {
    const url = parseStravaProfile(link);
    if (!url) return Alert.alert('Link do Strava', 'Cole o link do seu perfil, ex.: strava.com/athletes/12345 ou strava.app.link/…');
    Keyboard.dismiss();
    void step('link', 'strava.link_save', async () => { await api.saveStravaLink(url); await load(); });
  };
  const removeLink = () => Alert.alert('Remover link do Strava?', 'Amigos e organização deixam de ver o botão do seu perfil.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Remover', style: 'destructive', onPress: () => void step('remove', 'strava.link_remove', async () => { await api.removeStravaLink(); await load(); }) },
  ]);
  const connect = () => step('connect', 'strava.connect', async () => {
    const back = ExpoLinking.createURL('/profile');
    const res = await WebBrowser.openAuthSessionAsync(await api.stravaStart(back), back);
    if (res.type !== 'success') return; // cancelou
    if (!res.url.includes('strava=ok')) throw new Error('o Strava não autorizou o acesso às atividades');
    await load();
    setTimeout(() => void load().catch(() => undefined), 4000); // 1ª sincronização roda no servidor
  });
  const sync = () => step('sync', 'strava.sync', async () => { await api.stravaSync(); await load(); });
  const share = (patch: Parameters<typeof api.setStravaSharing>[0]) =>
    step('share', 'strava.share', async () => { await api.setStravaSharing(patch); await load(); });
  const disconnect = () => Alert.alert('Desconectar o Strava?', 'Apagamos as atividades importadas e o acesso à sua conta Strava.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Desconectar', style: 'destructive', onPress: () => void step('disconnect', 'strava.disconnect', async () => { await api.stravaDisconnect(); await load(); }) },
  ]);

  if (account === undefined) return null;
  const viaApi = account?.athlete_id != null;
  const url = account ? stravaLink(account) : null;
  return (
    <View style={st.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={st.logo}><Text style={st.logoText}>S</Text></View>
        <Text style={st.title}>Strava</Text>
      </View>

      {!viaApi && (
        <>
          <Body small>Coloque o link do seu perfil para amigos e organização te encontrarem no Strava. Você escolhe quem vê.</Body>
          <Input label="Link do perfil Strava" placeholder="strava.com/athletes/12345" value={link} onChangeText={setLink}
            hint="No app Strava: Você → ícone de compartilhar → Copiar link. No site: abra seu perfil e copie o endereço."
            autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><StravaButton label={account ? 'Atualizar link' : 'Salvar link'} icon="link-outline" busy={busy === 'link'} onPress={saveLink} /></View>
            {account && <Pressable onPress={removeLink} style={st.outline} accessibilityRole="button"><Text style={st.outlineText}>Remover</Text></Pressable>}
          </View>
        </>
      )}
      {viaApi && (
        <Body small>Conectado como <Text style={{ fontFamily: font.bold }}>{account!.athlete_name ?? 'atleta'}</Text></Body>
      )}

      {account && url && (
        <>
          <Pressable onPress={() => openUrl(url)} accessibilityRole="link"><Text style={st.view}>Abrir meu perfil no Strava →</Text></Pressable>
          <Toggle label="Amigos veem meu perfil Strava" hint="Só amigos aceitos aqui no app, para seguir você no Strava." value={account.share_with_friends} onChange={(v) => share({ share_with_friends: v })} />
          <Toggle label={viaApi ? 'Organização vê meu perfil e atividades' : 'Organização vê meu perfil Strava'}
            hint={viaApi ? 'Link e resumo dos seus treinos no app e no painel.' : 'Link do seu perfil no app e no painel da organização.'}
            value={account.share_with_org} onChange={(v) => share({ share_with_org: v })} />
        </>
      )}

      {viaApi && (
        <>
          <StravaActivities activities={acts} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><StravaButton label="Sincronizar" icon="sync-outline" busy={busy === 'sync'} onPress={sync} /></View>
            <Pressable onPress={disconnect} style={st.outline} accessibilityRole="button"><Text style={st.outlineText}>Desconectar</Text></Pressable>
          </View>
          {account!.last_sync_at && <Text style={st.hint}>Última sincronização: {new Date(account!.last_sync_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Text>}
        </>
      )}
      {!viaApi && apiOn && (
        <>
          <Text style={st.hint}>Ou conecte a conta para importar seus treinos:</Text>
          <StravaButton label="Conectar com Strava" icon="log-in-outline" busy={busy === 'connect'} onPress={connect} />
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: c.surface, borderRadius: radius, padding: 16, gap: 12, borderWidth: 1, borderColor: c.line, ...shadow },
  logo: { width: 24, height: 24, borderRadius: 5, backgroundColor: STRAVA_ORANGE, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontFamily: font.display, fontSize: 14 },
  title: { fontFamily: font.display, fontSize: 14, color: c.charcoal, textTransform: 'uppercase' },
  btn: { minHeight: 46, borderRadius: radius, backgroundColor: STRAVA_ORANGE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  btnText: { color: '#fff', fontFamily: font.bold, fontSize: 13.5, letterSpacing: 0.6, textTransform: 'uppercase' },
  outline: { minHeight: 46, borderRadius: radius, borderWidth: 1.5, borderColor: c.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  outlineText: { fontFamily: font.bold, fontSize: 12.5, color: c.charcoal, textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { fontFamily: font.body, fontSize: 12, color: c.inkSoft },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, borderRadius: radius, padding: 10, backgroundColor: c.white, borderWidth: 1, borderColor: c.line },
  kpiValue: { fontFamily: font.display, fontSize: 18, color: c.charcoal },
  kpiLabel: { fontFamily: font.body, fontSize: 10.5, color: c.inkSoft, textTransform: 'uppercase' },
  act: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  actName: { fontFamily: font.bold, fontSize: 14, color: c.charcoal },
  actSub: { fontFamily: font.body, fontSize: 12, color: c.inkSoft },
  view: { fontFamily: font.bold, fontSize: 12, color: STRAVA_ORANGE },
  powered: { fontFamily: font.body, fontSize: 11, color: c.inkSoft, textAlign: 'right' },
});
