import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { DIRECTORY_SORT, directoryStats, filterDirectory, isProfileComplete, sortDirectory, type DirectoryFilter, type DirectorySort, type PersonRow } from '@mb/core';
import { Body, Input, Screen } from '@/components/ui';
import { act, Chips, Kpis, ListItem, Pill, shareCsv, SmallButton } from '@/components/admin/kit';
import { api } from '@/lib/services';
import { c } from '@/theme';

const QUICK = {
  all: 'Todos', admin: 'Organizadores', user: 'Participantes', incomplete: 'Cadastro incompleto',
  events: 'Já fez evento', races: 'Já fez corrida', active: 'Ativos 30 dias', never: 'Nunca participou', strava: 'Com Strava',
} as const;
type Quick = keyof typeof QUICK;
const toFilter = (q: Quick): DirectoryFilter => ({
  all: {}, admin: { role: 'admin' as const }, user: { role: 'user' as const }, incomplete: { profile: 'incomplete' as const },
  events: { minEvents: 1 }, races: { minRaces: 1 }, active: { activeDays: 30 }, never: { neverParticipated: true }, strava: { strava: true },
})[q];

/** Todas as contas (só organização): busca, filtros rápidos, ordenação e CSV. */
export default function People() {
  const [rows, setRows] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [quick, setQuick] = useState<Quick>('all');
  const [sort, setSort] = useState<DirectorySort>('name');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const r = await act('admin.people', api.people);
    if (r) setRows(r);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  const shown = useMemo(() => sortDirectory(filterDirectory(rows, { ...toFilter(quick), q }), sort), [rows, quick, q, sort]);
  const counts = useMemo(() => Object.fromEntries((Object.keys(QUICK) as Quick[]).map((k) => [k, filterDirectory(rows, toFilter(k)).length])) as Record<Quick, number>, [rows]);
  const st = directoryStats(rows);

  return (
    <Screen>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <Kpis items={[
              { label: 'Contas', value: st.total },
              { label: 'Ativos 30 dias', value: st.active30d, tone: 'ok' },
              { label: 'km percorridos', value: st.km },
            ]} />
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{ flex: 1 }}><Input placeholder="Nome, e-mail, inscrição ou celular" value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} /></View>
              <SmallButton icon="share-outline" label="CSV" onPress={() => shareCsv('Pessoas', shown.map((p) => ({
                nome: p.display_name, email: p.email, papel: p.role, celular: p.phone, inscricao: p.registration_number,
                eventos: p.events_started, corridas: p.races_started, km: p.total_km, chamados: p.calls, ultima_atividade: p.last_activity,
                strava_km_30d: p.strava_km_30d ?? '',
              })))} />
            </View>
            <Chips options={QUICK} value={quick} onChange={setQuick} counts={counts} />
            <Chips options={DIRECTORY_SORT} value={sort} onChange={setSort} />
            <Body muted small>{shown.length} de {rows.length} pessoas</Body>
          </View>
        }
        ListEmptyComponent={loading ? undefined : <Body muted small>Ninguém com esses filtros.</Body>}
        renderItem={({ item: p }) => (
          <ListItem title={p.display_name}
            subtitle={`${p.events_started} evento(s) · ${p.races_started} corrida(s) · ${Number(p.total_km).toFixed(0)} km${p.calls ? ` · ${p.calls} chamado(s)` : ''}${p.strava_url ? (p.strava_km_30d != null ? ` · Strava ${Number(p.strava_km_30d).toFixed(0)} km/30d` : ' · Strava') : ''}`}
            right={p.role === 'admin' ? <Pill text="org" color={c.charcoal} /> : !isProfileComplete(p) ? <Pill text="incompleto" color={c.warn} /> : undefined}
            onPress={() => router.push(`/admin/person/${p.id}`)} />
        )}
      />
    </Screen>
  );
}
