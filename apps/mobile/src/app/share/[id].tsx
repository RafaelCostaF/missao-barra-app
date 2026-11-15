import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams } from 'expo-router';
import { ArchivoBlack_400Regular } from '@expo-google-fonts/archivo-black';
import { Inter_400Regular, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import logoPng from '@mb/ui-tokens/icons/icon-512.png';
import {
  buildShareScene, buildTrack, lineToPoints, SHARE_FORMATS, SHARE_LAYOUTS, shareFileName, summarizeTrack, toGPX, trackRowsToFixes,
  type ShareFormat, type ShareLayout, type TrackPoint,
} from '@mb/core';
import { Body, Button, Screen } from '@/components/ui';
import { ShareCanvas } from '@/components/share/ShareCanvas';
import { SHARE_BACKGROUNDS } from '@/components/share/backgrounds';
import { useLiveSession } from '@/hooks/useLiveSession';
import { useStartedAt } from '@/hooks/useStartedAt';
import type { ShareCanvasHandle } from '@/lib/shareBridge';
import { assetDataUrl, shareFile } from '@/lib/shareFiles';
import { api, logger, tracker } from '@/lib/services';
import { c, font, radius } from '@/theme';

/** Quadros do vídeo (30 fps): ~9 s de percurso + abertura e fechamento no canvas. */
const VIDEO_FRAMES = 270;
const STRAVA_UPLOAD = 'https://www.strava.com/upload/select';

type Bg = { key: string; src: string | null };

/** Compartilhar corrida: arte (imagem) ou vídeo com o percurso, e GPX para o Strava. */
export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, participants } = useLiveSession(id);
  const { height } = useWindowDimensions();
  const canvas = useRef<ShareCanvasHandle>(null);
  const [me, setMe] = useState('');
  const [track, setTrack] = useState<TrackPoint[] | null>(null);
  const [layout, setLayout] = useState<ShareLayout>('farol');
  const [format, setFormat] = useState<ShareFormat>('story');
  const [bgKey, setBgKey] = useState(SHARE_BACKGROUNDS[0].key);
  const [bg, setBg] = useState<Bg | null>(null);
  const [custom, setCustom] = useState<string | null>(null);
  const [showName, setShowName] = useState(true);
  const [assets, setAssets] = useState<{ logo: string; display: string; body: string; bold: string } | null>(null);
  const [busy, setBusy] = useState<'image' | 'video' | 'gpx' | null>(null);
  const [progress, setProgress] = useState(0);
  const cache = useRef(new Map<string, string>());

  const mine = participants.find((p) => p.user_id === me);
  const { start, end } = useStartedAt(id, me, mine?.status);

  useEffect(() => void api.me().then(setMe), []);
  // Trilha do servidor; sem ela (sem internet / mais de 30 dias), o que este aparelho registrou.
  useEffect(() => {
    void api.myTrack(id)
      .then((rows) => trackRowsToFixes(rows))
      .catch((e) => { void logger.warn('share.track', { session_id: id, error: String(e) }); return []; })
      .then((fixes) => setTrack(buildTrack(fixes.length ? fixes : tracker.stats.track())));
  }, [id]);
  useEffect(() => {
    void Promise.all([
      assetDataUrl(logoPng as unknown as number, 'image/png'),
      assetDataUrl(ArchivoBlack_400Regular, 'font/ttf'),
      assetDataUrl(Inter_400Regular, 'font/ttf'),
      assetDataUrl(Inter_800ExtraBold, 'font/ttf'),
    ]).then(([logo, display, body, bold]) => setAssets({ logo, display, body, bold }))
      .catch((e) => logger.error('share.assets', e));
  }, []);
  // Fundo escolhido → data URL (com cache).
  useEffect(() => {
    let alive = true;
    const set = (src: string | null) => alive && setBg({ key: bgKey, src });
    if (bgKey === 'none') set(null);
    else if (bgKey === 'custom') set(custom);
    else if (cache.current.has(bgKey)) set(cache.current.get(bgKey)!);
    else {
      const item = SHARE_BACKGROUNDS.find((b) => b.key === bgKey)!;
      void assetDataUrl(item.full, 'image/jpeg').then((src) => { cache.current.set(bgKey, src); set(src); }).catch(() => set(null));
    }
    return () => { alive = false; };
  }, [bgKey, custom]);

  const summary = useMemo(() => track && summarizeTrack(track, { distanceM: mine?.distance_m, startedAt: start, endedAt: end }), [track, mine?.distance_m, start, end]);
  const scene = useMemo(() => {
    if (!session || !track || !summary) return null;
    return buildShareScene({
      track, summary, route: lineToPoints(session.route) ?? undefined, title: session.name, name: showName ? mine?.display_name ?? '' : '',
      layout, format, photo: bgKey !== 'none', frameCount: VIDEO_FRAMES,
    });
  }, [session, track, summary, showName, mine?.display_name, layout, format, bgKey]);

  const canVideo = (track?.length ?? 0) >= 2;
  const fileBase = session?.name ?? 'Missão Barra';
  const at = summary?.startedAt ?? null;

  async function pick(source: 'camera' | 'library') {
    if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
      Alert.alert('Câmera bloqueada', 'Permita o acesso à câmera nos Ajustes do celular para tirar a foto.');
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const ctx = ImageManipulator.manipulate(a.uri);
    // Dimensões explícitas (na web `null` quebra o redimensionamento); só reduz, nunca amplia.
    const W = a.width ?? 0, H = a.height ?? 0;
    const k = W && H ? Math.min(1, W > H ? 1600 / H : 1280 / W) : 1;
    if (k < 1) ctx.resize({ width: Math.round(W * k), height: Math.round(H * k) });
    const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
    setCustom(`data:image/jpeg;base64,${out.base64}`);
    setBgKey('custom');
  }

  async function exportImage() {
    setBusy('image');
    try {
      const img = await canvas.current!.exportAs('image');
      await shareFile(shareFileName(fileBase, at, 'jpg'), { base64: img.base64 }, 'image/jpeg', 'Compartilhar corrida');
      void logger.info('share.image', { session_id: id, layout, format });
    } catch (e) {
      void logger.error('share.image', e, { session_id: id });
      Alert.alert('Não foi possível gerar a imagem', 'Tente de novo.');
    } finally {
      setBusy(null);
    }
  }

  async function exportVideo() {
    setBusy('video');
    setProgress(0);
    try {
      const v = await canvas.current!.exportAs('video', setProgress);
      const ext = v.mime.includes('mp4') ? 'mp4' : 'webm';
      await shareFile(shareFileName(fileBase, at, ext), { base64: v.base64 }, v.mime, 'Compartilhar vídeo da corrida');
      void logger.info('share.video', { session_id: id, layout, format, mime: v.mime });
    } catch (e) {
      const unsupported = e instanceof Error && e.message === 'unsupported';
      void logger.warn('share.video_failed', { session_id: id, error: String(e) });
      Alert.alert('Não foi possível gerar o vídeo', unsupported
        ? 'Este aparelho não grava vídeo por aqui. Atualize o sistema ou compartilhe a imagem.'
        : 'Tente de novo. Mantenha esta tela aberta enquanto o vídeo é gravado.');
    } finally {
      setBusy(null);
    }
  }

  async function exportGpx() {
    if (!track || track.length < 2) return;
    setBusy('gpx');
    try {
      await shareFile(shareFileName(fileBase, at, 'gpx'), { text: toGPX(track, fileBase) }, 'application/gpx+xml', 'Salvar arquivo GPX');
      void logger.info('share.gpx', { session_id: id, points: track.length });
    } catch (e) {
      void logger.error('share.gpx', e, { session_id: id });
      Alert.alert('Não foi possível exportar', 'Tente de novo.');
    } finally {
      setBusy(null);
    }
  }

  const { w, h } = SHARE_FORMATS[format];
  const previewH = Math.min(height * 0.5, 470);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View style={[st.preview, { height: previewH }]}>
          <ShareCanvas ref={canvas} scene={scene} bg={bg} assets={assets} style={{ flex: 1, alignSelf: 'stretch' }} />
          {(!scene || !assets) && <Text style={st.loading}>Montando sua arte…</Text>}
          {busy === 'video' && (
            <View style={st.recording} pointerEvents="none">
              <View style={st.recDot} />
              <Text style={st.recText}>Gravando vídeo… {Math.round(progress * 100)}%</Text>
            </View>
          )}
        </View>

        <Section title="Modelo">
          <View style={st.wrap}>
            {SHARE_LAYOUTS.map((l) => (
              <Chip key={l.id} label={l.label} on={layout === l.id} onPress={() => setLayout(l.id)} hint={l.hint} />
            ))}
          </View>
        </Section>

        <Section title="Fundo">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
            <Tile label="Galeria" icon="images-outline" onPress={() => void pick('library')} />
            {Platform.OS !== 'web' && <Tile label="Câmera" icon="camera-outline" onPress={() => void pick('camera')} />}
            {custom && <Tile label="Sua foto" uri={custom} on={bgKey === 'custom'} onPress={() => setBgKey('custom')} />}
            {SHARE_BACKGROUNDS.map((b) => <Tile key={b.key} label={b.label} source={b.thumb} on={bgKey === b.key} onPress={() => setBgKey(b.key)} />)}
            <Tile label="Sem foto" icon="contrast-outline" dark on={bgKey === 'none'} onPress={() => setBgKey('none')} />
          </ScrollView>
        </Section>

        <Section title="Formato">
          <View style={st.wrap}>
            {(Object.keys(SHARE_FORMATS) as ShareFormat[]).map((f) => (
              <Chip key={f} label={SHARE_FORMATS[f].label} on={format === f} onPress={() => setFormat(f)} />
            ))}
            <Chip label="Meu nome" icon={showName ? 'checkmark' : 'add'} on={showName} onPress={() => setShowName((v) => !v)} />
          </View>
        </Section>

        <View style={{ gap: 10 }}>
          <Button icon="share-social-outline" haptic="light" label="Compartilhar imagem" busy={busy === 'image'} disabled={!scene || !assets || !!busy} onPress={exportImage} />
          <Button icon="videocam-outline" variant="secondary" label={busy === 'video' ? 'Gravando vídeo…' : 'Criar vídeo do percurso'} busy={busy === 'video'}
            disabled={!scene || !assets || !canVideo || !!busy} onPress={exportVideo} />
          <Body muted small>
            {canVideo
              ? `${w}×${h} px. O vídeo (~12 s) mostra seu trajeto com o horário real de cada trecho e é gerado no próprio celular: mantenha a tela aberta.`
              : 'Sem trilha registrada nesta corrida (ou ela tem mais de 30 dias): a arte usa o percurso oficial e o vídeo fica indisponível.'}
          </Body>
        </View>

        <View style={st.strava}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="cloud-upload-outline" size={20} color="#FC4C02" />
            <Text style={st.stravaTitle}>Enviar para o Strava</Text>
          </View>
          <Body small>
            1. Salve o arquivo GPX da corrida (em Arquivos ou no próprio celular).{'\n'}
            2. Abra o Strava pelo navegador e toque em “Arquivo” para carregar o GPX.{'\n'}
            O app do Strava não importa arquivos; o envio pelo site é gratuito.
          </Body>
          <Button icon="download-outline" variant="secondary" label="Salvar arquivo GPX" busy={busy === 'gpx'} disabled={!canVideo || !!busy} onPress={exportGpx} />
          <Pressable onPress={() => void WebBrowser.openBrowserAsync(STRAVA_UPLOAD)} accessibilityRole="link" style={st.link}>
            <Text style={st.linkText}>Abrir upload do Strava</Text>
            <Ionicons name="open-outline" size={15} color="#FC4C02" />
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={st.section}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({ label, on, onPress, hint, icon }: { label: string; on: boolean; onPress: () => void; hint?: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityHint={hint}
      style={({ pressed }) => [st.chip, on && st.chipOn, pressed && { opacity: 0.85 }]}>
      {icon && <Ionicons name={icon} size={14} color={on ? c.white : c.charcoal} />}
      <Text style={[st.chipText, on && { color: c.white }]}>{label}</Text>
    </Pressable>
  );
}

function Tile({ label, source, uri, icon, on, dark, onPress }: {
  label: string; source?: number; uri?: string; icon?: keyof typeof Ionicons.glyphMap; on?: boolean; dark?: boolean; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!on }} style={{ width: 76, gap: 4 }}>
      <View style={[st.tile, on && st.tileOn, dark && { backgroundColor: c.charcoal }]}>
        {source != null || uri ? <Image source={uri ? { uri } : source!} style={{ width: 76, height: 76 }} resizeMode="cover" /> : <Ionicons name={icon!} size={26} color={dark ? c.white : c.charcoal} />}
      </View>
      <Text style={[st.tileText, on && { color: c.orangeDark }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  preview: { borderRadius: radius, backgroundColor: '#ECE3D9', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 10 },
  loading: { position: 'absolute', fontFamily: font.bold, fontSize: 13, color: c.inkSoft },
  recording: { position: 'absolute', top: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(29,30,34,0.85)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E5352B' },
  recText: { fontFamily: font.bold, fontSize: 12.5, color: c.white },
  section: { fontFamily: font.bold, fontSize: 12, color: c.inkSoft, letterSpacing: 1, textTransform: 'uppercase' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface },
  chipOn: { backgroundColor: c.charcoal, borderColor: c.charcoal },
  chipText: { fontFamily: font.bold, fontSize: 13, color: c.charcoal },
  tile: { width: 76, height: 76, borderRadius: 10, overflow: 'hidden', borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
  tileOn: { borderWidth: 3, borderColor: c.orange },
  tileText: { fontFamily: font.bold, fontSize: 11, color: c.charcoal, textAlign: 'center' },
  strava: { gap: 10, padding: 14, borderRadius: radius, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  stravaTitle: { fontFamily: font.display, fontSize: 15, color: c.charcoal, textTransform: 'uppercase' },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
  linkText: { fontFamily: font.bold, fontSize: 13.5, color: '#FC4C02' },
});
