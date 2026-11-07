import { accumulate } from './geo';
import type { Logger } from './logger';
import { jsonStore, type KeyValueStore } from './storage';
import type { Fix } from './types';

/** Fixes piores que isso nem são enviados (ruído). */
export const MAX_SEND_ACCURACY_M = 100;
const MAX_PENDING = 2000;
const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000];

export type PushFn = (sessionId: string, fixes: Fix[], distanceM: number) => Promise<void>;

interface QueueState {
  sessionId: string | null;
  last: Fix | null; // último fix confiável (base da distância)
  pending: Fix[];
  pendingDistance: number;
  failures: number;
  retryAt: number;
  lastError?: string;
}

const EMPTY: QueueState = { sessionId: null, last: null, pending: [], pendingDistance: 0, failures: 0, retryAt: 0 };

export type SyncState = { pending: number; failures: number; lastSyncAt: number | null; lastError?: string };

/**
 * Fila persistente de posições: sobrevive a app fechado e falta de internet,
 * envia em lote e espera com backoff após falhas.
 */
export function createPositionQueue(kv: KeyValueStore, push: PushFn, logger: Logger, now = () => Date.now()) {
  const store = jsonStore<QueueState>(kv, 'mb.positionQueue', EMPTY);
  let lastSyncAt: number | null = null;
  let running: Promise<boolean> | null = null;

  return {
    async reset(sessionId: string | null) {
      await store.save({ ...EMPTY, sessionId });
    },

    async add(fixes: Fix[]) {
      const s = await store.load();
      if (!s.sessionId) return;
      const usable = fixes.filter((f) => f.accuracy <= MAX_SEND_ACCURACY_M);
      const { distance, last } = accumulate(s.last, usable);
      s.pending = [...s.pending, ...usable].slice(-MAX_PENDING);
      s.pendingDistance += distance;
      s.last = last;
      await store.save(s);
    },

    /** true se a fila ficou vazia. `force` ignora o backoff (ex.: conexão voltou). */
    flush(force = false): Promise<boolean> {
      running ??= (async () => {
        const s = await store.load();
        if (!s.sessionId || !s.pending.length) return true;
        if (!force && now() < s.retryAt) return false;
        const batch = s.pending;
        try {
          await logger.timed('positions.push', () => push(s.sessionId!, batch, s.pendingDistance), { count: batch.length });
          const cur = await store.load();
          // Mantém o que entrou durante o envio.
          await store.save({ ...cur, pending: cur.pending.slice(batch.length), pendingDistance: cur.pendingDistance - s.pendingDistance, failures: 0, retryAt: 0, lastError: undefined });
          lastSyncAt = now();
          return cur.pending.length === batch.length;
        } catch (e) {
          const cur = await store.load();
          const failures = cur.failures + 1;
          const lastError = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
          await store.save({ ...cur, failures, lastError, retryAt: now() + BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1] });
          await logger.warn('positions.queued', { queued: cur.pending.length, failures });
          return false;
        }
      })().finally(() => (running = null));
      return running;
    },

    async state(): Promise<SyncState> {
      const s = await store.load();
      return { pending: s.pending.length, failures: s.failures, lastSyncAt, lastError: s.lastError };
    },

    activeSession: async () => (await store.load()).sessionId,
  };
}

export type PositionQueue = ReturnType<typeof createPositionQueue>;
