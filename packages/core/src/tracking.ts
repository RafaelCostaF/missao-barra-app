import type { Logger } from './logger';
import type { PositionQueue } from './queue';
import type { Fix } from './types';
import { createRunStats } from './run';

export type PermissionResult = 'granted' | 'denied';

/** Adaptador do GPS do dispositivo (expo-location no app; simulado nos testes). */
export interface LocationProvider {
  requestPermission(): Promise<PermissionResult>;
  start(): Promise<void>; // fixes chegam por tracker.onFixes (task de 2º plano)
  stop(): Promise<void>;
}

export interface TrackingApi {
  startTracking(sessionId: string): Promise<void>;
  finish(sessionId: string): Promise<void>;
}

export type TrackerState = 'idle' | 'permission_denied' | 'tracking' | 'finished' | 'error';

/** Resposta do servidor quando a participação já foi encerrada (ex.: criador encerrou para todos). */
const ENDED_BY_SERVER = /not tracking/;

/**
 * Fluxo único de monitoramento, igual para evento oficial e corrida privada.
 * A UI mostra a explicação de uso da localização ANTES de chamar start().
 */
export function createTracker(deps: { location: LocationProvider; api: TrackingApi; queue: PositionQueue; logger: Logger }) {
  const { location, api, queue, logger } = deps;
  let state: TrackerState = 'idle';
  /** Métricas do corredor (pace, parciais) calculadas no aparelho a partir dos mesmos fixes enviados. */
  const stats = createRunStats();
  const listeners = new Set<(s: TrackerState) => void>();
  const set = (s: TrackerState) => {
    state = s;
    listeners.forEach((l) => l(s));
  };

  return {
    get state() {
      return state;
    },
    stats,
    subscribe(fn: (s: TrackerState) => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },

    async start(sessionId: string) {
      if ((await location.requestPermission()) !== 'granted') {
        await logger.warn('gps.permission_denied', { session_id: sessionId });
        set('permission_denied');
        return state;
      }
      try {
        await logger.timed('api.start_tracking', () => api.startTracking(sessionId));
        await queue.reset(sessionId);
        stats.reset();
        await location.start();
        await logger.info('session.start', { session_id: sessionId });
        set('tracking');
      } catch (e) {
        await logger.error('session.start_failed', e);
        await location.stop().catch(() => undefined);
        set('error');
      }
      return state;
    },

    /** Chamado pela task de localização; também funciona com o app em 2º plano. */
    async onFixes(fixes: Fix[]) {
      if (!(await queue.activeSession())) return;
      stats.add(fixes);
      await queue.add(fixes);
      await queue.flush();
      // Encerrado no servidor: desliga o GPS para não gastar bateria nem tentar para sempre.
      const { lastError } = await queue.state();
      if (lastError && ENDED_BY_SERVER.test(lastError)) {
        const sessionId = await queue.activeSession();
        await location.stop();
        await logger.info('session.ended_by_server', { session_id: sessionId });
        await queue.reset(null);
        await logger.flush();
        set('finished');
      }
    },

    async onLocationError(err: unknown) {
      await logger.error('gps.error', err);
    },

    async onConnectivity(online: boolean) {
      await logger.info(online ? 'net.online' : 'net.offline');
      if (online) await Promise.all([queue.flush(true), logger.flush()]);
    },

    /** Finaliza a participação: para o GPS, envia o que falta e avisa o servidor. */
    async finish() {
      const sessionId = await queue.activeSession();
      await location.stop();
      if (!sessionId) return set('finished');
      await queue.flush(true);
      try {
        await logger.timed('api.finish', () => api.finish(sessionId));
      } finally {
        const { pending } = await queue.state();
        await logger.info('session.end', { session_id: sessionId, unsent: pending });
        await queue.reset(null);
        await logger.flush();
        set('finished');
      }
    },
  };
}

export type Tracker = ReturnType<typeof createTracker>;
