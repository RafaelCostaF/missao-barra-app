import { useCallback, useEffect, useImperativeHandle, useRef, type ComponentType, type Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import type { ShareScene } from '@mb/core';
import { SHARE_HTML } from '@/lib/shareRenderer';
import { useShareBridge, type CanvasMsg, type ShareCanvasHandle } from '@/lib/shareBridge';

export interface ShareCanvasProps {
  ref?: Ref<ShareCanvasHandle>;
  scene: ShareScene | null;
  bg: { key: string; src: string | null } | null;
  assets: { logo: string; display: string; body: string; bold: string } | null;
  style?: StyleProp<ViewStyle>;
}

// Os tipos de classe do WebView não fecham com @types/react 19: só usamos estes dois métodos.
type WebViewHandle = { injectJavaScript(js: string): void; reload(): void };
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

/** Prévia ao vivo + exportação (imagem JPEG / vídeo gravado no aparelho) via canvas num WebView. */
export function ShareCanvas({ ref, scene, bg, assets, style }: ShareCanvasProps) {
  const web = useRef<WebViewHandle>(null);
  const post = useCallback((m: CanvasMsg) => web.current?.injectJavaScript(`window.mbReceive&&window.mbReceive(${JSON.stringify(m)});true;`), []);
  const { ready, send, onMessage, exportAs, reset } = useShareBridge(post);
  useImperativeHandle(ref, () => ({ exportAs }), [exportAs]);
  useEffect(() => { if (assets) send({ type: 'assets', ...assets }, 'assets'); }, [assets, ready, send]);
  useEffect(() => { if (bg) send({ type: 'bg', ...bg }, 'bg'); }, [bg, ready, send]);
  useEffect(() => { if (scene) send({ type: 'scene', scene }, 'scene'); }, [scene, ready, send]);
  return (
    <WebView
      ref={web}
      source={{ html: SHARE_HTML }}
      originWhitelist={['*']}
      onMessage={(e: WebViewMessageEvent) => onMessage(e.nativeEvent.data)}
      onContentProcessDidTerminate={() => { reset(); web.current?.reload(); }}
      onRenderProcessGone={() => { reset(); web.current?.reload(); }}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      showsVerticalScrollIndicator={false}
      javaScriptEnabled
      style={[{ backgroundColor: 'transparent' }, style]}
      containerStyle={{ backgroundColor: 'transparent' }}
      accessibilityLabel="Prévia da arte para compartilhar"
    />
  );
}
