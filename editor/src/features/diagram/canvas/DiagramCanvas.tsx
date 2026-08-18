import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
// WebViewErrorEvent/WebViewHttpErrorEvent não são reexportados pelo index.d.ts raiz do pacote
// (só FileDownload/WebViewMessageEvent/WebViewNavigation são) — precisam vir do subcaminho.
import type { WebViewErrorEvent, WebViewHttpErrorEvent } from 'react-native-webview/lib/WebViewTypes';
import type { Selection } from '@/domain/types';
import { parseFromWeb, sendToWeb } from './bridge';
import { useRuntimeHtml } from './useRuntimeHtml';

export interface DiagramCanvasHandle {
  fit: () => void;
  reveal: (fracaoTopo?: number) => void;
  zoomBy: (factor: number) => void;
  exportPng: (scale?: number) => Promise<string>;
  validate: (code: string) => Promise<{ ok: boolean; message?: string }>;
}

interface Props {
  code: string;
  theme: 'dark' | 'light';
  tokens: Record<string, string>;
  sel: Selection | null;
  /** sel.id pode ser um índice, não o id real, para kind 'edge'/'rel' — ver bridge.ts. */
  onTap: (sel: Selection | null, duplo: boolean) => void;
  onError?: (message: string) => void;
  /** Só chega pra documentos tipo 'raw' — flow/er derivam a lista do próprio Doc. */
  onElements?: (items: { id: string; texto: string }[]) => void;
  /** Reportado a cada frame em que o zoom muda — gesto de pinça, botões +/-, fit(), duplo-toque. */
  onZoomChange?: (k: number) => void;
}

const TIMEOUT_PRONTO_MS = 8000;

// O WebView é um componente burro: desenha e reporta toques. Toda a UI (barra de ações,
// sheets, formulários) é React Native de verdade (docs/06-canvas.md).
export const DiagramCanvas = forwardRef<DiagramCanvasHandle, Props>(function DiagramCanvas(
  { code, theme, tokens, sel, onTap, onError, onElements, onZoomChange },
  ref
) {
  const { html, error: htmlError } = useRuntimeHtml();
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [webviewError, setWebviewError] = useState<string | null>(null);
  const [demorou, setDemorou] = useState(false);
  const pngResolvers = useRef<Array<(base64: string) => void>>([]);
  const validateResolvers = useRef<Map<string, (r: { ok: boolean; message?: string }) => void>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({
    fit: () => sendToWeb(webRef, { t: 'fit' }),
    reveal: (fracaoTopo = 0.3) => sendToWeb(webRef, { t: 'reveal', fracaoTopo }),
    zoomBy: (factor) => sendToWeb(webRef, { t: 'zoomBy', factor }),
    exportPng: (scale = 2) =>
      new Promise<string>((resolve) => {
        pngResolvers.current.push(resolve);
        sendToWeb(webRef, { t: 'exportPng', scale });
      }),
    validate: (code) =>
      new Promise((resolve) => {
        const reqId = Math.random().toString(36).slice(2);
        validateResolvers.current.set(reqId, resolve);
        sendToWeb(webRef, { t: 'validate', code, reqId });
      }),
  }));

  // Se o WebView montar e nunca mandar 'ready', o app não trava — mas fica em branco sem
  // pista nenhuma. Esse aviso é o que diferencia "não carregou" de "carregou e não desenhou".
  useEffect(() => {
    if (!html || ready) return;
    const t = setTimeout(() => setDemorou(true), TIMEOUT_PRONTO_MS);
    return () => clearTimeout(t);
  }, [html, ready]);

  // Debounce de ~120ms: cada tecla digitada num rótulo não precisa rodar o dagre de novo.
  useEffect(() => {
    if (!ready) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      sendToWeb(webRef, { t: 'render', code, theme, tokens });
    }, 120);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [ready, code, theme, tokens]);

  useEffect(() => {
    if (!ready) return;
    sendToWeb(webRef, { t: 'select', sel });
  }, [ready, sel]);

  const handleMessage = (e: WebViewMessageEvent) => {
    const msg = parseFromWeb(e.nativeEvent.data);
    if (!msg) return;
    if (msg.t === 'ready') setReady(true);
    else if (msg.t === 'tap') onTap(msg.sel, msg.duplo);
    else if (msg.t === 'error') onError?.(msg.message);
    else if (msg.t === 'png') {
      const resolver = pngResolvers.current.shift();
      resolver?.(msg.base64);
    } else if (msg.t === 'validated') {
      const resolver = validateResolvers.current.get(msg.reqId);
      validateResolvers.current.delete(msg.reqId);
      resolver?.({ ok: msg.ok, message: msg.message });
    } else if (msg.t === 'elements') {
      onElements?.(msg.items);
    } else if (msg.t === 'zoom') {
      onZoomChange?.(msg.k);
    }
  };

  const handleWebViewError = (e: WebViewErrorEvent) => {
    const { description, code: errCode } = e.nativeEvent;
    const msg = `WebView falhou ao carregar (código ${errCode}): ${description}`;
    console.error('[DiagramCanvas]', msg);
    setWebviewError(msg);
  };

  const handleWebViewHttpError = (e: WebViewHttpErrorEvent) => {
    const { statusCode, description } = e.nativeEvent;
    const msg = `WebView recebeu erro HTTP ${statusCode}: ${description}`;
    console.error('[DiagramCanvas]', msg);
    setWebviewError(msg);
  };

  if (htmlError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>Não consegui carregar o canvas.{'\n'}{htmlError}</Text>
      </View>
    );
  }
  if (webviewError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>{webviewError}</Text>
      </View>
    );
  }
  if (!html) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <WebView
        ref={webRef}
        source={{ html, baseUrl: '' }}
        originWhitelist={['*']}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        javaScriptEnabled
        domStorageEnabled={false}
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        onMessage={handleMessage}
        onError={handleWebViewError}
        onHttpError={handleWebViewHttpError}
        style={styles.webview}
      />
      {!ready && demorou ? (
        <View style={styles.overlayAviso} pointerEvents="none">
          <Text style={styles.avisoText}>
            O canvas carregou mas não respondeu — veja o console (Metro/Xcode/Logcat) por um erro de JS dentro do
            WebView.
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errText: { color: '#FF453A', fontSize: 13, textAlign: 'center' },
  overlayAviso: { position: 'absolute', left: 14, right: 14, bottom: 14, padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,69,58,0.15)' },
  avisoText: { color: '#FF453A', fontSize: 12, textAlign: 'center' },
});
