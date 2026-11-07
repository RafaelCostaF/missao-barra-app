import { describe, expect, it, vi } from 'vitest';
import { accumulate, createLogger, getSignalState, haversine, memoryStore, nextCheckpoint, sanitize, type Checkpoint } from '../src';

const fix = (lat: number, lng: number, accuracy = 5) => ({ lat, lng, accuracy, recordedAt: '' });

describe('getSignalState', () => {
  const now = Date.parse('2026-10-21T12:00:00Z');
  it('distingue estados', () => {
    expect(getSignalState({ status: 'accepted', last_at: null }, now)).toBe('not_started');
    expect(getSignalState({ status: 'tracking', last_at: '2026-10-21T11:59:30Z' }, now)).toBe('tracking');
    expect(getSignalState({ status: 'tracking', last_at: '2026-10-21T11:55:00Z' }, now)).toBe('stale');
    expect(getSignalState({ status: 'finished', last_at: '2026-10-21T11:59:30Z' }, now)).toBe('finished');
  });
});

describe('geo', () => {
  it('haversine ~ Farol de Itapuã → Farol da Barra', () => {
    const d = haversine({ lat: -12.9570655, lng: -38.3536886 }, { lat: -13.0101987, lng: -38.5329168 });
    expect(d).toBeGreaterThan(19_000);
    expect(d).toBeLessThan(21_000);
  });
  it('ignora fixes imprecisos e ruído parado', () => {
    const { distance } = accumulate(null, [fix(-13, -38.5), fix(-13.001, -38.5, 200), fix(-13.00001, -38.5), fix(-13.001, -38.5)]);
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(120);
  });
  it('próximo ponto de apoio', () => {
    const cps = [{ km: 0 }, { km: 10 }, { km: 16 }] as Checkpoint[];
    expect(nextCheckpoint(cps, 12_000)?.km).toBe(16);
    expect(nextCheckpoint(cps, 20_000)).toBeNull();
  });
});

describe('logger', () => {
  it('remove segredos e coordenadas', () => {
    expect(sanitize({ token: 'x', lat: 1, nested: { password: 'p', ok: true } })).toEqual({
      token: '[redacted]',
      nested: { password: '[redacted]', ok: true },
    });
  });

  it('mantém logs offline e reenvia quando a conexão volta', async () => {
    const storage = memoryStore();
    const buffered = async () => JSON.parse((await storage.getItem('mb.logBuffer')) ?? '[]');
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true });
    const log = createLogger({ endpoint: 'x', getAuthToken: async () => null, storage, context: () => ({ app_version: '1' }), fetchImpl });

    await log.error('gps.permission_denied', new Error('denied'));
    await log.flush();
    const buf = await buffered();
    expect(buf).toHaveLength(1);
    expect(buf[0]).toMatchObject({ level: 'error', app_version: '1', error: 'Error: denied' });

    await log.flush();
    expect(await buffered()).toHaveLength(0);
  });
});

describe('toFix', () => {
  it('converte localização do dispositivo; sem precisão é descartada', async () => {
    const { toFix, accumulate } = await import('../src');
    const f = toFix({ coords: { latitude: -13, longitude: -38.5, accuracy: null }, timestamp: 0 });
    expect(f).toMatchObject({ lat: -13, lng: -38.5, recordedAt: '1970-01-01T00:00:00.000Z' });
    expect(accumulate(null, [f]).last).toBeNull();
  });
});
