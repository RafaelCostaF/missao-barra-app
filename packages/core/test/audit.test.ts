import { describe, expect, it } from 'vitest';
import { fmtDuration, pace, reportKpis, type ParticipantSummary } from '../src';

const cps = [{ name: 'A', km: 0 }, { name: 'B', km: 10 }, { name: 'C', km: 20 }];
const row = (id: string, reached: [string, number][], calls = 0): ParticipantSummary => ({
  session_id: 's', user_id: id, display_name: id, status: 'finished', started_at: null, finished_at: null, duration_s: 0,
  distance_m: 0, positions: 0, max_gap_s: null, alerts_help: calls, alerts_emergency: 0, alerts_signal_lost: 0,
  passages: reached.map(([name, min]) => ({ name, km: 0, at: '', elapsed_s: min * 60 })),
});

describe('reportKpis', () => {
  it('conclusão, tempo mediano, chamados por pessoa, resolução e funil', () => {
    const rows = [row('a', [['A', 0], ['B', 100], ['C', 200]], 2), row('b', [['A', 0], ['B', 120], ['C', 260]]), row('c', [['A', 0], ['B', 150]])];
    const alerts = [
      { type: 'help', created_at: '2026-01-01T10:00:00Z', resolved_at: '2026-01-01T10:04:00Z' },
      { type: 'emergency', created_at: '2026-01-01T11:00:00Z', resolved_at: '2026-01-01T11:02:00Z' },
      { type: 'signal_lost', created_at: '2026-01-01T12:00:00Z', resolved_at: null },
    ] as const;
    const k = reportKpis(rows, [...alerts], cps);
    expect(k).toMatchObject({ participants: 3, completionRate: 2 / 3, medianFinishS: 230 * 60, calls: 2, peopleWithCalls: 1, medianResolutionS: 180 });
    expect(k.callsPerPerson).toBeCloseTo(0.667, 2);
    expect(k.funnel.map((f) => [f.name, f.reached, f.medianElapsedS! / 60])).toEqual([['A', 3, 0], ['B', 3, 120], ['C', 2, 230]]);
    // Quem passou em cada ponto (mais rápido primeiro) e quem ainda não passou.
    expect(k.funnel[1].reachedBy.map((r) => r.user_id)).toEqual(['a', 'b', 'c']);
    expect(k.funnel[2].missing).toEqual(['c']);
  });
  it('formatos', () => {
    expect(fmtDuration(18120)).toBe('5h 02min');
    expect(fmtDuration(2820)).toBe('47 min');
    expect(pace(3600, 6000)).toBe('10:00 min/km');
    expect(pace(null, 1000)).toBe('—');
  });
});
