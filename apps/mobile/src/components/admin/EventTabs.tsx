import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  analyzeCrowd, classifyPeople, fmtDuration, getSignalState, matchesPerson, pace, PERSON_FILTERS, reportKpis, SIGNAL_LABEL, summarize,
  type Alert, type Checkpoint, type Contact, type LiveParticipant, type ParticipantSummary, type Person, type PersonFilter,
} from '@mb/core';
import { Body, Input, Title } from '@/components/ui';
import { LiveMap } from '@/components/LiveMap';
import { act, Bar, Card, Chips, Kpis, ListItem, Pill, shareCsv, SmallButton } from './kit';
import { ago, ALERT_LABEL, hhmm } from './labels';
import { api } from '@/lib/services';
import { c, font, radius, signalColor } from '@/theme';

type Live = { participants: LiveParticipant[]; checkpoints: Checkpoint[]; alerts: Alert[]; reload: () => Promise<void> };
const REASON = { stale: 'Sem sinal', off_route: 'Fora do percurso', behind: 'Retardatário' } as const;
const openPerson = (sessionId: string, userId: string) => router.push(`/admin/participant?session=${sessionId}&user=${userId}`);

/** Mapa, contadores, distribuição pelo percurso e quem precisa de atenção — tudo tocável para achar a pessoa. */
export function EventMonitor({ sessionId, participants, checkpoints, alerts, now, onFilter, initialFocus = null }: Live & { sessionId: string; now: number; onFilter: (f: PersonFilter) => void; initialFocus?: string | null }) {
  const [group, setGroup] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(initialFocus);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const stats = summarize(participants, alerts, now);
  const crowd = analyzeCrowd(participants, checkpoints, now);
  const maxSeg = Math.max(1, ...crowd.segments.map((s) => s.count));
  const nameOf = (uid: string) => participants.find((p) => p.user_id === uid)?.display_name ?? '—';
  const groups: Record<string, { label: string; ids: string[] }> = {
    ...Object.fromEntries(crowd.segments.map((sg) => [`seg:${sg.label}`, { label: sg.label, ids: sg.user_ids }])),
    ...Object.fromEntries((Object.keys(REASON) as (keyof typeof REASON)[]).map((r) => [`out:${r}`, { label: REASON[r], ids: [...new Set(crowd.outliers.filter((o) => o.reason === r).map((o) => o.user_id))] }])),
  };
  const sel = group ? groups[group] : null;
  const selKey = sel ? sel.ids.join(',') : '';
  const highlight = selKey ? new Set(selKey.split(',')) : undefined;
  const toggle = (key: string) => { setFocus(null); setGroup((g) => (g === key ? null : key)); };
  // Tocar num nome: centraliza no mapa (sobe a tela até ele) e abre o balão.
  const show = (uid: string) => { setFocus(uid); scroll.current?.scrollTo({ y: 0, animated: true }); };

  const list = (ids: string[], detail?: (uid: string) => string | undefined) => (
    <GroupList ids={ids} nameOf={nameOf} focus={focus} onShow={show} onProfile={(uid) => openPerson(sessionId, uid)} detail={detail} />
  );

  return (
    <ScrollView ref={scroll} contentContainerStyle={{ gap: 12, paddingVertical: 12 }}>
      {(sel || focus) && (
        <View style={st.selection}>
          <Text style={st.selText} numberOfLines={2}>{focus ? `Em foco: ${nameOf(focus)}` : `Destacando ${sel!.label} (${sel!.ids.length})`}</Text>
          {focus && <SmallButton icon="person-outline" label="Perfil" onPress={() => openPerson(sessionId, focus)} />}
          <SmallButton icon="close" label="" a11y="Limpar seleção" onPress={() => { setGroup(null); setFocus(null); }} />
        </View>
      )}
      <View style={{ height: 320, borderRadius: radius, overflow: 'hidden', borderWidth: 1, borderColor: c.line }}>
        <LiveMap participants={participants} checkpoints={checkpoints} now={now} focus={focus} highlight={highlight} onSelect={(uid) => openPerson(sessionId, uid)} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <KpiButton label="Ativos" value={stats.tracking} tone={c.ok} onPress={() => onFilter('tracking')} />
        <KpiButton label="Sem sinal" value={stats.stale} tone={c.warn} onPress={() => onFilter('stale')} />
        <KpiButton label="Finalizados" value={stats.finished} onPress={() => onFilter('finished')} />
      </View>
      <Card title="Onde está o grupo">
        {crowd.majority
          ? <Title size={17}>{Math.round(crowd.majority.share * 100)}% entre {crowd.majority.label}</Title>
          : <Body muted small>{checkpoints.length < 2 ? 'Cadastre o percurso para ver a distribuição.' : 'Sem posições ativas.'}</Body>}
        {crowd.segments.length > 0 && <Body muted small>Toque num trecho para ver quem está nele.</Body>}
        {crowd.segments.map((s) => {
          const key = `seg:${s.label}`;
          return (
            <View key={s.label} style={{ gap: 6 }}>
              <Pressable onPress={() => toggle(key)} disabled={!s.count} style={[st.tap, group === key && st.tapOn]} accessibilityRole="button" accessibilityState={{ expanded: group === key }}>
                <Bar label={s.label} value={s.count} max={maxSeg} />
              </Pressable>
              {group === key && list(s.user_ids)}
            </View>
          );
        })}
      </Card>
      <Card title="Atenção">
        <Chips options={REASON} value={(group?.startsWith('out:') ? group.slice(4) : '') as keyof typeof REASON}
          onChange={(r) => toggle(`out:${r}`)} counts={Object.fromEntries((Object.keys(REASON) as (keyof typeof REASON)[]).map((r) => [r, groups[`out:${r}`].ids.length]))}
          hot={['stale', 'off_route', 'behind']} />
        {group?.startsWith('out:') && list(groups[group].ids, (uid) => crowd.outliers.find((o) => o.user_id === uid && `out:${o.reason}` === group)?.detail)}
        {!group?.startsWith('out:') && !crowd.attention.length && <Body muted small>Ninguém fora do padrão.</Body>}
        {!group?.startsWith('out:') && crowd.attention.map((a) => (
          <ListItem key={a.user_id} accent={a.reason === 'off_route' ? c.danger : a.reason === 'stale' ? c.warn : c.orange}
            title={a.name} subtitle={`${REASON[a.reason]} · ${a.detail} · toque para ver no mapa`} onPress={() => show(a.user_id)} />
        ))}
      </Card>
    </ScrollView>
  );
}

/** Nomes de um grupo: tocar centraliza no mapa; botão abre perfil e contato. */
function GroupList({ ids, nameOf, focus, onShow, onProfile, detail }: {
  ids: string[]; nameOf: (uid: string) => string; focus: string | null; onShow: (uid: string) => void; onProfile: (uid: string) => void; detail?: (uid: string) => string | undefined;
}) {
  return (
    <View style={{ gap: 6, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: c.orange }}>
      {!ids.length && <Body muted small>Ninguém.</Body>}
      {ids.map((uid) => (
        <View key={uid} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable style={{ flex: 1 }} onPress={() => onShow(uid)} accessibilityRole="button" accessibilityLabel={`Mostrar ${nameOf(uid)} no mapa`}>
            <Text style={[st.name, focus === uid && { color: c.orangeDark }]} numberOfLines={1}>{nameOf(uid)}{detail?.(uid) ? <Text style={st.detail}> · {detail(uid)}</Text> : null}</Text>
          </Pressable>
          <SmallButton icon="person-outline" label="" a11y={`Perfil de ${nameOf(uid)}`} onPress={() => onProfile(uid)} />
        </View>
      ))}
    </View>
  );
}

function KpiButton({ label, value, tone, onPress }: { label: string; value: number; tone?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.kpi, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={`${value} ${label}: ver lista`}>
      <Text style={[st.kpiValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={st.kpiLabel}>{label} ›</Text>
    </Pressable>
  );
}

const PRIORITY: PersonFilter[] = ['open_call', 'stale', 'off_route', 'behind', 'low_battery', 'not_completed', 'not_started', 'tracking', 'completed'];
const rank = (p: Person) => { const i = PRIORITY.findIndex((f) => p.flags.has(f)); return i < 0 ? 99 : i; };

/** Rastreio um a um: filtros por situação, busca e CSV. */
export function EventPeople({ sessionId, participants, checkpoints, alerts, now, initialFilter = 'all' }: Live & { sessionId: string; now: number; initialFilter?: PersonFilter }) {
  const [report, setReport] = useState<ParticipantSummary[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filter, setFilter] = useState<PersonFilter>(initialFilter);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- filtro escolhido no monitoramento
  useEffect(() => setFilter(initialFilter), [initialFilter]);
  const [q, setQ] = useState('');
  const ids = participants.map((p) => p.user_id).sort().join(',');
  useEffect(() => {
    const load = () => void api.report(sessionId).then(setReport).catch(() => undefined);
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [sessionId]);
  useEffect(() => void api.contacts(ids ? ids.split(',') : []).then(setContacts).catch(() => undefined), [ids]);

  const people = useMemo(() => classifyPeople(participants, report, alerts, checkpoints, contacts, now), [participants, report, alerts, checkpoints, contacts, now]);
  const counts = Object.fromEntries((Object.keys(PERSON_FILTERS) as PersonFilter[]).map((f) => [f, people.filter((p) => p.flags.has(f)).length])) as Record<PersonFilter, number>;
  const shown = people.filter((p) => p.flags.has(filter) && matchesPerson(p, q)).sort((a, b) => rank(a) - rank(b) || a.display_name.localeCompare(b.display_name));

  return (
    <FlatList
      data={shown}
      keyExtractor={(p) => p.user_id}
      contentContainerStyle={{ gap: 8, paddingVertical: 12 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ flex: 1 }}><Input placeholder="Nome, inscrição ou celular" value={q} onChangeText={setQ} autoCorrect={false} /></View>
            <SmallButton icon="share-outline" label="CSV" onPress={() => shareCsv('Participantes', shown.map((p) => ({
              nome: p.display_name, inscricao: p.contact?.registration_number, celular: p.contact?.phone,
              situacao: [...p.flags].filter((f) => f !== 'all').map((f) => PERSON_FILTERS[f]).join(' | '),
              ultima_posicao: p.last_at, bateria: p.battery, lat: p.last_lat, lng: p.last_lng, km: (p.distance_m / 1000).toFixed(1), pontos: p.passed,
            })))} />
          </View>
          <Chips options={PERSON_FILTERS} value={filter} onChange={setFilter} counts={counts} hot={['open_call', 'stale', 'off_route', 'behind', 'low_battery']} />
        </View>
      }
      ListEmptyComponent={<Body muted small>Ninguém nesta situação.</Body>}
      renderItem={({ item: p }) => {
        const s = getSignalState(p as never, now);
        const tags = [
          p.flags.has('open_call') && 'Chamado aberto', p.flags.has('off_route') && 'Fora do percurso', p.flags.has('behind') && 'Retardatário',
          p.flags.has('low_battery') && `Bateria ${p.battery}%`, p.flags.has('not_completed') && 'Não concluiu',
        ].filter(Boolean).join(' · ');
        return (
          <ListItem accent={p.flags.has('open_call') ? c.danger : signalColor[s]} title={p.display_name}
            subtitle={`${SIGNAL_LABEL[s]} · ${ago(p.last_at, now)} · ${(p.distance_m / 1000).toFixed(1)} km · ${p.passed}/${checkpoints.length} pontos${tags ? `\n${tags}` : ''}`}
            onPress={() => openPerson(sessionId, p.user_id)} />
        );
      }}
    />
  );
}

/** Todos os alertas do evento, abertos primeiro. */
export function EventAlerts({ participants, alerts, reload }: Live) {
  const nameOf = (uid: string) => participants.find((p) => p.user_id === uid)?.display_name ?? '—';
  const sorted = [...alerts].sort((a, b) => Number(!!a.resolved_at) - Number(!!b.resolved_at));
  return (
    <FlatList
      data={sorted}
      keyExtractor={(a) => a.id}
      contentContainerStyle={{ gap: 8, paddingVertical: 12 }}
      ListEmptyComponent={<Body muted small>Nenhum alerta neste evento.</Body>}
      renderItem={({ item: a }) => (
        <View style={{ gap: 6, opacity: a.resolved_at ? 0.55 : 1 }}>
          <ListItem accent={a.type === 'emergency' ? c.danger : c.warn} title={`${ALERT_LABEL[a.type]} · ${nameOf(a.user_id)}`}
            subtitle={`${hhmm(a.created_at)}${a.lat != null ? ` · ${a.lat.toFixed(5)}, ${a.lng!.toFixed(5)}` : ' · sem posição'}${a.resolved_at ? ` · resolvido ${hhmm(a.resolved_at)}` : ''}`}
            onPress={() => openPerson(a.session_id, a.user_id)} />
          {!a.resolved_at && (
            <View style={{ alignItems: 'flex-end' }}>
              <SmallButton icon="checkmark" label="Resolvido" tone="ok" onPress={() => void act('admin.resolve_alert', () => api.resolveAlert(a.id)).then(reload)} />
            </View>
          )}
        </View>
      )}
    />
  );
}

/** Indicadores, funil por ponto de apoio e resumo por pessoa (toque abre a linha do tempo). */
export function EventReport({ sessionId, alerts, checkpoints }: Live & { sessionId: string }) {
  const [rows, setRows] = useState<ParticipantSummary[] | null>(null);
  const [openCp, setOpenCp] = useState<string | null>(null);
  useEffect(() => void act('admin.report', () => api.report(sessionId)).then((r) => setRows(r ?? [])), [sessionId]);
  if (!rows) return <Body muted>Carregando relatório…</Body>;
  const k = reportKpis(rows, alerts, checkpoints);
  const maxReach = Math.max(1, ...k.funnel.map((f) => f.reached));

  const exportCsv = () => shareCsv('Relatório', rows.map((r) => ({
    nome: r.display_name, status: r.status, inicio: r.started_at, fim: r.finished_at, duracao_s: r.duration_s,
    distancia_m: Math.round(r.distance_m), ajuda: r.alerts_help, emergencia: r.alerts_emergency, sinal_perdido: r.alerts_signal_lost,
    maior_sem_sinal_s: r.max_gap_s, posicoes: r.positions,
    ...Object.fromEntries(checkpoints.map((cp) => [`t_${cp.name}`, r.passages.find((p) => p.name === cp.name)?.elapsed_s ?? ''])),
  })));

  return (
    <ScrollView contentContainerStyle={{ gap: 12, paddingVertical: 12 }}>
      <Kpis items={[
        { label: 'Participantes', value: k.participants },
        { label: 'Concluíram', value: `${Math.round(k.completionRate * 100)}%`, tone: 'ok' },
        { label: 'Tempo mediano', value: fmtDuration(k.medianFinishS) },
        { label: `Chamados · ${k.callsPerPerson.toFixed(2)}/pessoa`, value: k.calls, tone: 'warn' },
        { label: 'Resposta mediana', value: fmtDuration(k.medianResolutionS) },
      ]} />
      <Card title="Avanço por ponto de apoio">
        {!k.funnel.length && <Body muted small>Sem percurso cadastrado.</Body>}
        {k.funnel.length > 0 && <Body muted small>Toque num ponto para ver quem passou e quem ainda não.</Body>}
        {k.funnel.map((f) => {
          const isOpen = openCp === f.name;
          const nm = (uid: string) => rows.find((r) => r.user_id === uid)?.display_name ?? '—';
          return (
            <View key={f.name} style={{ gap: 6 }}>
              <Pressable onPress={() => setOpenCp(isOpen ? null : f.name)} style={[st.tap, isOpen && st.tapOn]} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}>
                <Bar label={`km ${f.km} · ${f.name}`} value={f.reached} max={maxReach} note={fmtDuration(f.medianElapsedS)} />
              </Pressable>
              {isOpen && (
                <View style={{ gap: 4, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: c.orange }}>
                  <Text style={st.sub}>Passaram ({f.reachedBy.length}) · mais rápido primeiro</Text>
                  {f.reachedBy.map((h, i) => (
                    <Pressable key={h.user_id} onPress={() => openPerson(sessionId, h.user_id)}>
                      <Text style={st.name}>{i + 1}º {nm(h.user_id)} <Text style={st.detail}>· {fmtDuration(h.elapsed_s)}</Text></Text>
                    </Pressable>
                  ))}
                  <Text style={[st.sub, { marginTop: 6 }]}>Ainda não passaram ({f.missing.length})</Text>
                  {f.missing.map((uid) => (
                    <Pressable key={uid} onPress={() => openPerson(sessionId, uid)}>
                      <Text style={st.name}>{nm(uid)} <Text style={st.detail}>· {rows.find((r) => r.user_id === uid)?.status === 'tracking' ? 'em percurso' : 'finalizou antes'}</Text></Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </Card>
      <Card title={`Por participante (${rows.length})`} right={<SmallButton icon="share-outline" label="CSV" onPress={exportCsv} />}>
        {!rows.length && <Body muted small>Ninguém iniciou o percurso ainda.</Body>}
        {rows.map((r) => (
          <ListItem key={r.user_id} title={r.display_name}
            subtitle={`${r.status === 'tracking' ? 'Em percurso' : 'Finalizou'} · ${fmtDuration(r.duration_s)} · ${(r.distance_m / 1000).toFixed(1)} km · ${pace(r.duration_s, r.distance_m)} · ${r.passages.length}/${checkpoints.length} pontos`}
            right={r.alerts_help + r.alerts_emergency ? <Pill text={`${r.alerts_help + r.alerts_emergency} chamado(s)`} color={c.warn} /> : undefined}
            onPress={() => openPerson(sessionId, r.user_id)} />
        ))}
      </Card>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  selection: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.charcoal, borderRadius: radius, padding: 8, paddingLeft: 12 },
  selText: { flex: 1, fontFamily: font.bold, fontSize: 13, color: c.white },
  tap: { borderRadius: 6, paddingVertical: 4, paddingHorizontal: 4 },
  tapOn: { backgroundColor: c.sand },
  name: { fontFamily: font.bold, fontSize: 14, color: c.charcoal, paddingVertical: 3 },
  detail: { fontFamily: font.body, fontSize: 12.5, color: c.inkSoft },
  sub: { fontFamily: font.bold, fontSize: 11.5, color: c.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpi: { flex: 1, backgroundColor: c.surface, borderRadius: radius, padding: 10, borderWidth: 1, borderColor: c.line },
  kpiValue: { fontFamily: font.display, fontSize: 22, color: c.charcoal },
  kpiLabel: { fontFamily: font.body, fontSize: 10.5, color: c.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 },
});
