import { plural } from '@/lib/fmt';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { Body, Input, Screen } from '@/components/ui';
import { act, Chips, k, shareCsv, SmallButton } from '@/components/admin/kit';
import { api } from '@/lib/services';
import { c, font } from '@/theme';

const PERIOD = { h1: '1 hora', h24: '24 horas', d7: '7 dias', d30: '30 dias' } as const;
const PERIOD_MS = { h1: 3_600_000, h24: 86_400_000, d7: 7 * 86_400_000, d30: 30 * 86_400_000 };
const LEVEL = { all: 'Todos', error: 'Erros', warn: 'Avisos', info: 'Info', debug: 'Debug' } as const;
const LEVEL_COLOR: Record<string, string> = { error: c.danger, warn: c.warn, info: c.ok, debug: c.inkSoft };

type Row = Record<string, any>;

/** Logs técnicos com os mesmos filtros do painel (período, nível, evento, sessão, versão) e CSV. */
export default function Logs() {
  const [period, setPeriod] = useState<keyof typeof PERIOD>('h24');
  const [level, setLevel] = useState<keyof typeof LEVEL>('all');
  const [event, setEvent] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);

  const search = useCallback(async () => {
    const req = ++latest.current;
    setLoading(true);
    const r = await act('admin.logs', () => api.logs({
      from: new Date(Date.now() - PERIOD_MS[period]).toISOString(),
      level: level === 'all' ? undefined : level,
      event: event.trim() || undefined, sessionId: sessionId.trim() || undefined, appVersion: appVersion.trim() || undefined,
      limit: 300,
    }));
    if (req === latest.current) {
      if (r) setRows(r);
      setLoading(false);
    }
  }, [period, level, event, sessionId, appVersion]);
  // Período e nível filtram na hora; campos de texto ao tocar em Filtrar.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- só período/nível disparam busca automática
  useEffect(() => void search(), [period, level]);

  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ gap: 6, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={search} />}
        ListHeaderComponent={
          <View style={{ gap: 8, marginBottom: 4 }}>
            <Chips options={PERIOD} value={period} onChange={setPeriod} />
            <Chips options={LEVEL} value={level} onChange={setLevel} />
            <Input placeholder="Evento (prefixo, ex.: gps.)" value={event} onChangeText={setEvent} autoCapitalize="none" autoCorrect={false} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Input placeholder="ID da sessão" value={sessionId} onChangeText={setSessionId} autoCapitalize="none" autoCorrect={false} /></View>
              <View style={{ flex: 1 }}><Input placeholder="Versão do app" value={appVersion} onChangeText={setAppVersion} autoCapitalize="none" autoCorrect={false} /></View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><SmallButton icon="funnel-outline" label="Filtrar" tone="primary" onPress={() => void search()} /></View>
              <View style={{ flex: 1 }}><SmallButton icon="share-outline" label="CSV" onPress={() => shareCsv('Logs', rows)} /></View>
            </View>
            <Body muted small>{plural(rows.length, 'registro', 'registros')}{rows.length === 300 ? ' (máx. no app; use o painel para mais)' : ''}</Body>
          </View>
        }
        ListEmptyComponent={loading ? undefined : <Body muted small>Nenhum log para os filtros.</Body>}
        renderItem={({ item: r }) => (
          <View style={[k.item, { flexDirection: 'column', alignItems: 'stretch', gap: 2, borderLeftWidth: 4, borderLeftColor: LEVEL_COLOR[r.level] ?? c.line }]}>
            <Text style={{ fontFamily: font.bold, fontSize: 13, color: c.charcoal }}>{r.event}</Text>
            <Text style={k.itemSub}>
              {new Date(r.ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })} · {r.level}{r.latency_ms != null ? ` · ${r.latency_ms} ms` : ''}
              {r.session_id ? ` · sessão ${String(r.session_id).slice(0, 8)}` : ''}
            </Text>
            <Text style={k.itemSub}>{r.app_version} · {r.os} {r.device ?? ''}</Text>
            {r.error ? <Text style={{ fontFamily: font.body, fontSize: 12, color: c.danger }}>{r.error}</Text> : null}
            {r.meta && Object.keys(r.meta).length ? <Text style={{ fontFamily: font.body, fontSize: 11, color: c.inkSoft }} numberOfLines={3}>{JSON.stringify(r.meta)}</Text> : null}
          </View>
        )}
      />
    </Screen>
  );
}
