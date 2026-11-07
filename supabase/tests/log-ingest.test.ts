import { describe, expect, it } from 'vitest';
import { MAX_BATCH, toRows } from '../functions/log-ingest/rows';

describe('log-ingest', () => {
  it('rejeita corpo que não é lista', () => {
    expect(toRows({ event: 'x' })).toBeNull();
    expect(toRows(null)).toBeNull();
  });

  it('descarta entradas inválidas e limita o lote', () => {
    const rows = toRows([{ level: 'fatal', event: 'x' }, { level: 'info' }, { level: 'info', event: 'ok' }])!;
    expect(rows.map((r) => r.event)).toEqual(['ok']);
    expect(toRows(Array.from({ length: MAX_BATCH + 50 }, () => ({ level: 'info', event: 'e' })))).toHaveLength(MAX_BATCH);
  });

  it('remove coordenadas e segredos mesmo se o cliente esquecer', () => {
    const [r] = toRows([{ level: 'error', event: 'gps.error', meta: { lat: -13, coords: { latitude: 1 }, access_token: 'abc', nested: { password: 'x', ok: 1 } } }])!;
    expect(r.meta).toEqual({ access_token: '[redacted]', nested: { password: '[redacted]', ok: 1 } });
  });

  it('normaliza ids, latência e timestamp', () => {
    const [r] = toRows([{ level: 'info', event: 'positions.push', ts: 'ontem', session_id: 'nao-e-uuid', meta: { latency_ms: 12.7 } }])!;
    expect(r.session_id).toBeNull();
    expect(r.latency_ms).toBe(13);
    expect(Number.isNaN(Date.parse(r.ts as string))).toBe(false);
  });
});
