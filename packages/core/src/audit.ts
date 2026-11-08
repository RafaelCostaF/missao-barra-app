import type { Alert } from './api';

export interface Passage { name: string; km: number; at: string; elapsed_s: number }
export interface ParticipantSummary {
  session_id: string; user_id: string; display_name: string; status: string;
  started_at: string | null; finished_at: string | null; duration_s: number | null; distance_m: number;
  positions: number; max_gap_s: number | null; alerts_help: number; alerts_emergency: number; alerts_signal_lost: number;
  passages: Passage[];
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Indicadores do evento para análise posterior: conclusão, tempos, chamados e funil por ponto de apoio. */
export function reportKpis(rows: ParticipantSummary[], alerts: Pick<Alert, 'type' | 'created_at' | 'resolved_at'>[], checkpoints: { name: string; km: number }[]) {
  const last = [...checkpoints].sort((a, b) => b.km - a.km)[0];
  const completed = last ? rows.filter((r) => r.passages.some((p) => p.name === last.name)) : [];
  const calls = alerts.filter((a) => a.type !== 'signal_lost'); // chamados = pedidos humanos
  const resolved = alerts.filter((a) => a.resolved_at).map((a) => (Date.parse(a.resolved_at!) - Date.parse(a.created_at)) / 1000);
  return {
    participants: rows.length,
    completionRate: rows.length ? completed.length / rows.length : 0,
    medianFinishS: median(completed.map((r) => r.passages.find((p) => p.name === last!.name)!.elapsed_s)),
    calls: calls.length,
    callsPerPerson: rows.length ? calls.length / rows.length : 0,
    peopleWithCalls: rows.filter((r) => r.alerts_help + r.alerts_emergency > 0).length,
    medianResolutionS: median(resolved),
    funnel: [...checkpoints].sort((a, b) => a.km - b.km).map((c) => {
      const times = rows.flatMap((r) => r.passages.filter((p) => p.name === c.name).map((p) => p.elapsed_s));
      return { name: c.name, km: c.km, reached: times.length, medianElapsedS: median(times) };
    }),
  };
}

/** "5h 02min" / "47 min" */
export function fmtDuration(s: number | null | undefined) {
  if (s == null) return '—';
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}min` : `${m} min`;
}

/** Ritmo em min/km a partir de duração e distância. */
export function pace(durationS: number | null, distanceM: number) {
  if (!durationS || distanceM < 100) return '—';
  const sPerKm = durationS / (distanceM / 1000);
  return `${Math.floor(sPerKm / 60)}:${String(Math.round(sPerKm % 60)).padStart(2, '0')} min/km`;
}
