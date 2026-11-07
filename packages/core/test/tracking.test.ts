import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger, createPositionQueue, createTracker, memoryStore, type Fix, type LogEntry, type PermissionResult } from '../src';
import { walk } from './gps-sim';

/** Monta o fluxo completo com GPS, rede e servidor simulados. */
function setup(opts: { permission?: PermissionResult } = {}) {
  let online = true;
  let clock = 0;
  const server = { fixes: [] as Fix[], distance: 0, tracking: new Set<string>(), finished: new Set<string>() };
  const logs: LogEntry[] = [];
  const offline = () => Promise.reject(new TypeError('Network request failed'));

  const logger = createLogger({
    endpoint: 'https://x/functions/v1/log-ingest',
    getAuthToken: async () => 'jwt',
    storage: memoryStore(),
    context: () => ({ app_version: '1.0.0', os: 'android 15' }),
    fetchImpl: (async (_url: string, init: RequestInit) => {
      if (!online) return offline();
      logs.push(...JSON.parse(init.body as string));
      return { ok: true } as Response;
    }) as typeof fetch,
  });
  const push = vi.fn(async (sessionId: string, fixes: Fix[], d: number) => {
    if (!online) return offline();
    if (!server.tracking.has(sessionId)) throw new Error('not tracking');
    server.fixes.push(...fixes);
    server.distance += d;
  });
  const queue = createPositionQueue(memoryStore(), push, logger, () => clock);
  const location = { requestPermission: vi.fn(async () => opts.permission ?? 'granted'), start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
  const api = {
    startTracking: vi.fn(async (id: string) => {
      if (!online) return offline();
      server.tracking.add(id);
    }),
    finish: vi.fn(async (id: string) => {
      server.tracking.delete(id);
      server.finished.add(id);
    }),
  };
  const tracker = createTracker({ location, api, queue, logger });
  return {
    tracker, queue, logger, location, api, server, logs, push,
    setOnline: (v: boolean) => (online = v),
    advance: (ms: number) => (clock += ms),
  };
}

describe('rastreamento', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => (t = setup()));

  it('percurso de 1 h: envia tudo e calcula a distância com precisão', async () => {
    await t.tracker.start('ev1');
    expect(t.tracker.state).toBe('tracking');
    const fixes = walk({ seconds: 3600, everyS: 20, noiseM: 3 });
    for (const f of fixes) await t.tracker.onFixes([f]);
    expect(t.server.fixes).toHaveLength(fixes.length);
    // 1,4 m/s × 3600 s = 5040 m; ruído de GPS adiciona pouco.
    expect(t.server.distance).toBeGreaterThan(4900);
    expect(t.server.distance).toBeLessThan(5400);
  });

  it('descarta fixes imprecisos (ex.: sob prédios/túnel)', async () => {
    await t.tracker.start('ev1');
    const fixes = walk({ seconds: 1800, badEvery: 5 });
    for (const f of fixes) await t.tracker.onFixes([f]);
    expect(t.server.fixes.every((f) => f.accuracy <= 100)).toBe(true);
    expect(t.server.distance).toBeLessThan(1.4 * 1800 * 1.1);
  });

  it('sem internet: acumula, faz backoff e reenvia tudo ao reconectar', async () => {
    await t.tracker.start('ev1');
    const fixes = walk({ seconds: 600, everyS: 20 });
    await t.tracker.onFixes(fixes.slice(0, 5));
    t.setOnline(false);
    for (const f of fixes.slice(5, 20)) {
      await t.tracker.onFixes([f]);
      t.advance(20_000);
    }
    expect((await t.queue.state()).pending).toBe(15);
    const callsOffline = t.push.mock.calls.length;
    await t.tracker.onFixes(fixes.slice(20, 21)); // dentro do backoff: não tenta de novo
    expect(t.push.mock.calls.length).toBe(callsOffline);

    t.setOnline(true);
    await t.tracker.onConnectivity(true);
    expect((await t.queue.state()).pending).toBe(0);
    expect(t.server.fixes).toHaveLength(21);
    const events = t.logs.map((l) => l.event);
    expect(events).toEqual(expect.arrayContaining(['positions.queued', 'net.online', 'positions.push']));
    const failed = t.logs.find((l) => l.event === 'positions.push' && l.level === 'error');
    expect(failed).toMatchObject({ app_version: '1.0.0', error: 'TypeError: Network request failed' });
    expect(failed?.meta).toMatchObject({ ok: false, count: expect.any(Number) });
  });

  it('não registra coordenadas nos logs técnicos', async () => {
    await t.tracker.start('ev1');
    await t.tracker.onFixes(walk({ seconds: 60 }));
    await t.tracker.finish();
    expect(JSON.stringify(t.logs)).not.toMatch(/-12\.9|-38\.3/);
  });

  it('finalizar: para o GPS, envia o restante e para de aceitar posições', async () => {
    await t.tracker.start('ev1');
    await t.tracker.onFixes(walk({ seconds: 60 }));
    await t.tracker.finish();
    expect(t.location.stop).toHaveBeenCalled();
    expect(t.server.finished.has('ev1')).toBe(true);
    expect(t.tracker.state).toBe('finished');
    const before = t.server.fixes.length;
    await t.tracker.onFixes(walk({ seconds: 60 })); // task atrasada do SO
    expect(t.server.fixes).toHaveLength(before);
    expect(t.logs.map((l) => l.event)).toContain('session.end');
  });

  it('falha ao iniciar (offline) não deixa o GPS ligado', async () => {
    t.setOnline(false);
    await t.tracker.start('ev1');
    expect(t.tracker.state).toBe('error');
    expect(t.location.start).not.toHaveBeenCalled();
  });
});

describe('permissão de localização', () => {
  it('negada: não inicia nada e registra o motivo', async () => {
    const t = setup({ permission: 'denied' });
    expect(await t.tracker.start('ev1')).toBe('permission_denied');
    expect(t.api.startTracking).not.toHaveBeenCalled();
    expect(t.location.start).not.toHaveBeenCalled();
    await t.logger.flush();
    expect(t.logs[0]).toMatchObject({ level: 'warn', event: 'gps.permission_denied' });
  });
});

describe('encerrado pelo servidor', () => {
  it('desliga o GPS quando o servidor recusa por participação encerrada', async () => {
    const t = setup();
    await t.tracker.start('race');
    t.server.tracking.delete('race'); // criador encerrou para todos
    await t.tracker.onFixes(walk({ seconds: 20 }));
    expect(t.tracker.state).toBe('finished');
    expect(t.location.stop).toHaveBeenCalled();
    expect(await t.queue.activeSession()).toBeNull();
    expect(t.logs.map((l) => l.event)).toContain('session.ended_by_server');
  });

  it('erro de rede NÃO desliga o GPS', async () => {
    const t = setup();
    await t.tracker.start('ev');
    t.setOnline(false);
    await t.tracker.onFixes(walk({ seconds: 20 }));
    expect(t.tracker.state).toBe('tracking');
    expect(t.location.stop).not.toHaveBeenCalled();
  });
});
