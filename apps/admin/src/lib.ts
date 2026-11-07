import { createClient } from '@supabase/supabase-js';
import { createApi, createLogger, type KeyValueStore } from '@mb/core';

const url = import.meta.env.VITE_SUPABASE_URL as string;

export const supabase = createClient(url, import.meta.env.VITE_SUPABASE_ANON_KEY as string);
export const api = createApi(supabase);

const local: KeyValueStore = {
  getItem: async (k) => {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  setItem: async (k, v) => {
    try { localStorage.setItem(k, v); } catch { /* modo privado: segue sem buffer */ }
  },
};

export const logger = createLogger({
  endpoint: `${url}/functions/v1/log-ingest`,
  getAuthToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  storage: local,
  context: () => ({ app_version: `admin-${__APP_VERSION__}`, os: navigator.platform, device: 'web' }),
});

window.addEventListener('error', (e) => void logger.error('admin.error', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => void logger.error('admin.unhandled', e.reason));
window.addEventListener('online', () => void logger.flush());

/** Erro amigável na tela + registro nos logs. */
export async function run<T>(event: string, fn: () => Promise<T>, meta?: Record<string, unknown>): Promise<T | undefined> {
  try {
    return await logger.timed(event, fn, meta);
  } catch (e) {
    alert(`Não foi possível concluir: ${(e as Error).message}`);
    return undefined;
  }
}

export function download(name: string, content: string, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR') : '—');
