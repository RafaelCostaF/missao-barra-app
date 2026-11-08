export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  event: string;
  session_id?: string;
  pseudo_user?: string;
  app_version?: string;
  os?: string;
  device?: string;
  latency_ms?: number;
  error?: string;
  meta?: Record<string, unknown>;
}

import { jsonStore, type KeyValueStore } from './storage';

export interface LoggerOptions {
  endpoint: string; // Edge Function log-ingest
  getAuthToken: () => Promise<string | null>;
  storage: KeyValueStore; // buffer persiste enquanto estiver offline
  context: () => Partial<LogEntry>; // versão, SO, sessão, pseudo_user…
  maxBuffer?: number;
  fetchImpl?: typeof fetch;
}

const SECRET_KEYS = /token|password|senha|secret|authorization|apikey|api_key/i;
const COORD_KEYS = /^(lat|lng|lon|latitude|longitude|coords?)$/i;

/** Remove segredos e coordenadas de logs técnicos (localização fica só em `positions`). */
export function sanitize(meta: unknown): unknown {
  if (Array.isArray(meta)) return meta.map(sanitize);
  if (meta && typeof meta === 'object') {
    return Object.fromEntries(
      Object.entries(meta).flatMap(([k, v]) => {
        if (COORD_KEYS.test(k)) return [];
        return [[k, SECRET_KEYS.test(k) ? '[redacted]' : sanitize(v)]];
      }),
    );
  }
  return meta;
}

export function createLogger(opts: LoggerOptions) {
  const maxBuffer = opts.maxBuffer ?? 500;
  const store = jsonStore<LogEntry[]>(opts.storage, 'mb.logBuffer', []);
  const doFetch = opts.fetchImpl ?? fetch;
  let flushing: Promise<void> | null = null;
  // Toda leitura+escrita do buffer passa por esta fila: sem isso, um log gravado durante o envio
  // regravava entradas já enviadas e elas chegavam duplicadas no servidor.
  let chain: Promise<unknown> = Promise.resolve();
  const locked = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };

  const push = (entry: LogEntry) => locked(async () => {
    const buf = await store.load();
    buf.push(entry);
    await store.save(buf.slice(-maxBuffer)); // descarta os mais antigos se offline por muito tempo
  });

  async function sendBuffered() {
    const buf = await locked(() => store.load());
    if (!buf.length) return;
    const token = await opts.getAuthToken();
    const res = await doFetch(opts.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(buf),
    });
    if (!res.ok) throw new Error(`log-ingest ${res.status}`);
    // Remove só o que foi enviado; mantém o que chegou durante o envio.
    await locked(async () => store.save((await store.load()).slice(buf.length)));
  }

  /** Envia o buffer; falhas mantêm os logs para o próximo flush (ex.: ao reconectar). */
  function flush(): Promise<void> {
    flushing ??= sendBuffered()
      .catch(() => undefined)
      .finally(() => (flushing = null));
    return flushing;
  }

  async function log(level: LogLevel, event: string, meta?: Record<string, unknown>, err?: unknown) {
    await push({
      ts: new Date().toISOString(),
      level,
      event,
      ...opts.context(),
      ...(meta && { meta: sanitize(meta) as Record<string, unknown> }),
      ...(err !== undefined && { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) }),
    });
    if (level === 'error') void flush();
  }

  /** Mede latência e resultado de uma chamada de API. */
  async function timed<T>(event: string, fn: () => Promise<T>, meta?: Record<string, unknown>): Promise<T> {
    const start = Date.now();
    try {
      const out = await fn();
      await log('info', event, { ...meta, ok: true, latency_ms: Date.now() - start });
      return out;
    } catch (e) {
      await log('error', event, { ...meta, ok: false, latency_ms: Date.now() - start }, e);
      throw e;
    }
  }

  return {
    debug: (e: string, m?: Record<string, unknown>) => log('debug', e, m),
    info: (e: string, m?: Record<string, unknown>) => log('info', e, m),
    warn: (e: string, m?: Record<string, unknown>) => log('warn', e, m),
    error: (e: string, err: unknown, m?: Record<string, unknown>) => log('error', e, m, err),
    timed,
    flush,
  };
}

export type Logger = ReturnType<typeof createLogger>;
