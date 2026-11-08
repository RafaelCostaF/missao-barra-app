import { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
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
import { c, radius, signalColor } from '@/theme';

type Live = { participants: LiveParticipant[]; checkpoints: Checkpoint[]; alerts: Alert[]; reload: () => Promise<void> };
const REASON = { stale: 'Sem sinal', off_route: 'Fora do percurso', behind: 'Retardatário' } as const;
const openPerson = (sessionId: string, userId: string) => router.push(`/admin/participant?session=${sessionId}&user=${userId}`);

/** Mapa, contadores, distribuição pelo percurso e quem precisa de atenção. */
export function EventMonitor({ sessionId, participants, checkpoints, alerts, now }: Live & { sessionId: string; now: number }) {
  const stats = summarize(participants, alerts, now);
  const crowd = analyzeCrowd(participants, checkpoints, now);
  const maxSeg = Math.max(1, ...crowd.segments.map((s) => s.count));
  return (
    <ScrollView contentContainerStyle={{ gap: 12, paddingVertical: 12 }}>
      <View style={{ height: 300, borderRadius: radius, overflow: 'hidden', borderWidth: 1, borderColor: c.line }}>
        <LiveMap participants={participants} checkpoints={checkpoints} now={now} />
      </View>
      <Kpis items={[
        { label: 'Ativos', value: stats.tracking, tone: 'ok' },
        { label: 'Sem sinal', value: stats.stale, tone: 'warn' },
        { label: 'Finalizados', value: stats.finished },
      ]} />
      <Card title="Onde está o grupo">
        {crowd.majority
          ? <Title size={17}>{Math.round(crowd.majority.share * 100)}% entre {crowd.majority.label}</Title>
          : <Body muted small>{checkpoints.length < 2 ? 'Cadastre o percurso para ver a distribuição.' : 'Sem posições ativas.'}</Body>}
        {crowd.segments.map((s) => <Bar key={s.label} label={s.label} value={s.count} max={maxSeg} />)}
      </Card>
      <Card title="Atenção">
        {!crowd.attention.length && <Body muted small>Ninguém fora do padrão.</Body>}
        {crowd.attention.map((a) => (
          <ListItem key={a.user_id} accent={a.reason === 'off_route' ? c.danger : a.reason === 'stale' ? c.warn : c.orange}
            title={a.name} subtitle={`${REASON[a.reason]} · ${a.detail}`} onPress={() => openPerson(sessionId, a.user_id)} />
        ))}
      </Card>
    </ScrollView>
  );
}

const PRIORITY: PersonFilter[] = ['open_call', 'stale', 'off_route', 'low_battery', 'not_completed', 'not_started', 'tracking', 'completed'];
const rank = (p: Person) => { const i = PRIORITY.findIndex((f) => p.flags.has(f)); return i < 0 ? 99 : i; };

/** Rastreio um a um: filtros por situação, busca e CSV. */
export function EventPeople({ sessionId, participants, checkpoints, alerts, now }: Live & { sessionId: string; now: number }) {
  const [report, setReport] = useState<ParticipantSummary[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filter, setFilter] = useState<PersonFilter>('all');
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
          <Chips options={PERSON_FILTERS} value={filter} onChange={setFilter} counts={counts} hot={['open_call', 'stale', 'off_route', 'low_battery']} />
        </View>
      }
      ListEmptyComponent={<Body muted small>Ninguém nesta situação.</Body>}
      renderItem={({ item: p }) => {
        const s = getSignalState(p as never, now);
        const tags = [
          p.flags.has('open_call') && 'Chamado aberto', p.flags.has('off_route') && 'Fora do percurso',
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
        {k.funnel.map((f) => <Bar key={f.name} label={`km ${f.km} · ${f.name}`} value={f.reached} max={maxReach} note={fmtDuration(f.medianElapsedS)} />)}
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
