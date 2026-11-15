// Ponte app ↔ canvas de compartilhamento (WebView no celular, iframe na web).
// App → canvas: assets (logo/fontes), bg (foto de fundo), scene, export. Canvas → app: ready, chunk/done/error, progress.
import { useCallback, useRef, useState } from 'react';

export interface ShareExport {
  base64: string;
  mime: string;
}
export type CanvasMsg =
  | { type: 'assets'; logo: string; display: string; body: string; bold: string }
  | { type: 'bg'; src: string | null; key: string }
  | { type: 'scene'; scene: unknown }
  | { type: 'export'; id: string; kind: 'image' | 'video' };

export interface ShareCanvasHandle {
  exportAs(kind: 'image' | 'video', onProgress?: (p: number) => void): Promise<ShareExport>;
}

type Pending = { parts: string[]; resolve: (e: ShareExport) => void; reject: (e: Error) => void; onProgress?: (p: number) => void };

/** Mensagens são enfileiradas até o canvas avisar que carregou. */
export function useShareBridge(post: (msg: CanvasMsg) => void) {
  const [ready, setReady] = useState(false);
  const queue = useRef<CanvasMsg[]>([]);
  const readyRef = useRef(false);
  const pending = useRef(new Map<string, Pending>());
  const last = useRef(new Map<string, string>());

  const send = useCallback((msg: CanvasMsg, dedupeKey?: string) => {
    if (dedupeKey) {
      const s = JSON.stringify(msg);
      if (last.current.get(dedupeKey) === s) return;
      last.current.set(dedupeKey, s);
    }
    if (readyRef.current) post(msg);
    else queue.current.push(msg);
  }, [post]);

  const onMessage = useCallback((raw: string) => {
    let m: { type: string; id?: string; i?: number; n?: number; data?: string; mime?: string; p?: number; message?: string };
    try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'ready') {
      readyRef.current = true;
      setReady(true);
      queue.current.splice(0).forEach(post);
      return;
    }
    const job = m.id ? pending.current.get(m.id) : undefined;
    if (!job) return;
    if (m.type === 'chunk') job.parts[m.i!] = m.data!;
    else if (m.type === 'progress') job.onProgress?.(m.p!);
    else if (m.type === 'done') {
      pending.current.delete(m.id!);
      job.onProgress?.(1);
      job.resolve({ base64: job.parts.join(''), mime: m.mime! });
    } else if (m.type === 'error') {
      pending.current.delete(m.id!);
      job.reject(new Error(m.message ?? 'erro'));
    }
  }, [post]);

  const exportAs = useCallback((kind: 'image' | 'video', onProgress?: (p: number) => void) =>
    new Promise<ShareExport>((resolve, reject) => {
      const id = `${kind}-${Date.now()}`;
      pending.current.set(id, { parts: [], resolve, reject, onProgress });
      send({ type: 'export', id, kind });
    }), [send]);

  /** Reinicia (o WebView recarregou a página). */
  const reset = useCallback(() => {
    readyRef.current = false;
    setReady(false);
    last.current.clear();
  }, []);

  return { ready, send, onMessage, exportAs, reset };
}
