import { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import { SHARE_HTML } from '@/lib/shareRenderer';
import { useShareBridge, type CanvasMsg } from '@/lib/shareBridge';
import type { ShareCanvasProps } from './ShareCanvas';

/** Web (prévia de layout): mesmo canvas num iframe, conversando por postMessage. */
export function ShareCanvas({ ref, scene, bg, assets, style }: ShareCanvasProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const post = useCallback((m: CanvasMsg) => frame.current?.contentWindow?.postMessage(JSON.stringify({ ...m, to: 'canvas' }), '*'), []);
  const { ready, send, onMessage, exportAs } = useShareBridge(post);
  useImperativeHandle(ref, () => ({ exportAs }), [exportAs]);
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.source === frame.current?.contentWindow && typeof e.data === 'string') onMessage(e.data); };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [onMessage]);
  useEffect(() => { if (assets) send({ type: 'assets', ...assets }, 'assets'); }, [assets, ready, send]);
  useEffect(() => { if (bg) send({ type: 'bg', ...bg }, 'bg'); }, [bg, ready, send]);
  useEffect(() => { if (scene) send({ type: 'scene', scene }, 'scene'); }, [scene, ready, send]);
  return (
    <View style={style}>
      <iframe ref={frame} srcDoc={SHARE_HTML} title="Prévia da arte para compartilhar" style={{ border: 0, width: '100%', height: '100%', background: 'transparent' }} />
    </View>
  );
}
