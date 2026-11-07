// Validação e limpeza dos logs recebidos. Sem dependências de Deno: também é usado nos testes.
export const MAX_BATCH = 500;
const LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const COLUMNS = ['session_id', 'pseudo_user', 'app_version', 'os', 'device', 'error'] as const;
const SECRET = /token|password|senha|secret|authorization|apikey|api_key/i;
const COORD = /^(lat|lng|lon|latitude|longitude|coords?)$/i;
const UUID = /^[0-9a-f-]{36}$/i;

// Segunda barreira: o cliente já sanitiza, mas não confiamos nele.
function clean(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).filter(([k]) => !COORD.test(k)).map(([k, x]) => [k, SECRET.test(k) ? '[redacted]' : clean(x)]));
  return v;
}

/** Converte o corpo da requisição em linhas de app_logs; entradas inválidas são descartadas. */
export function toRows(body: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(body)) return null;
  return body.slice(0, MAX_BATCH).flatMap((e: Record<string, any>) => {
    if (typeof e?.event !== 'string' || !LEVELS.has(e.level)) return [];
    const meta = (clean(e.meta ?? {}) ?? {}) as Record<string, unknown>;
    const latency = Number(e.latency_ms ?? meta.latency_ms);
    const row: Record<string, unknown> = {
      ts: typeof e.ts === 'string' && !Number.isNaN(Date.parse(e.ts)) ? e.ts : new Date().toISOString(),
      level: e.level,
      event: e.event.slice(0, 120),
      latency_ms: Number.isFinite(latency) ? Math.round(latency) : null,
      meta,
    };
    for (const c of COLUMNS) row[c] = typeof e[c] === 'string' ? String(e[c]).slice(0, 500) : null;
    for (const c of ['session_id', 'pseudo_user'] as const) if (row[c] && !UUID.test(row[c] as string)) row[c] = null;
    return [row];
  });
}
