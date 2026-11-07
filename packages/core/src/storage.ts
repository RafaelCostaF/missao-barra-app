/** Armazenamento chave/valor do dispositivo (AsyncStorage no app, localStorage no painel). */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export function jsonStore<T>(kv: KeyValueStore, key: string, initial: T) {
  return {
    async load(): Promise<T> {
      const raw = await kv.getItem(key);
      if (!raw) return initial;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return initial;
      }
    },
    save: (value: T) => kv.setItem(key, JSON.stringify(value)),
  };
}

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v) };
}
