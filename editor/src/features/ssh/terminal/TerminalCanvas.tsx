import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import type { WebViewErrorEvent, WebViewHttpErrorEvent, WebViewTerminatedEvent } from 'react-native-webview/lib/WebViewTypes';
import { parseFromTerminal, sendToTerminal } from './bridge';
import { useTerminalHtml } from './useTerminalHtml';

export interface TerminalCanvasHandle {
  write: (b64: string) => void;
  clear: () => void;
  fit: () => void;
  setFontSize: (size: number) => void;
  setTheme: (theme: Record<string, string>) => void;
  focus: () => void;
}

interface Props {
  onReady: (cols: number, rows: number) => void;
  onInput: (b64: string) => void;
  onResize: (cols: number, rows: number) => void;
  onBell?: () => void;
}

const TIMEOUT_PRONTO_MS = 8000;

// WebView burro (xterm.js desenha, RN manda bytes) — mesmo espírito de
// features/diagram/canvas/DiagramCanvas.tsx: toda UI ao redor (barra de teclas, NavBar, sheets)
// é React Native de verdade.
//
// memo()/useMemo(source) — não era a causa do bug de reload relatado (esse era o atalho de
// teclado do próprio Metro CLI, 'r' = reload, disparado sem querer quando o foco do teclado do
// Mac estava no terminal em vez do Simulator — nada de errado no app). Mas o problema que a
// investigação REVELOU de verdade é real e vale a pena manter corrigido: `source={{ html,
// baseUrl: '' }}` como objeto inline cria referência NOVA a cada render, e react-native-webview
// recarrega o conteúdo (perde a sessão do xterm.js) sempre que a identidade de `source` muda,
// mesmo com o mesmo `html`. `useMemo` mantém `source` estável entre renders; `memo()` evita
// re-renderizar este componente à toa quando TerminalScreen re-renderiza por outro motivo.
export const TerminalCanvas = memo(
  forwardRef<TerminalCanvasHandle, Props>(function TerminalCanvas({ onReady, onInput, onResize, onBell }, ref) {
    const { html, error: htmlError } = useTerminalHtml();
    const webRef = useRef<WebView>(null);
    const [ready, setReady] = useState(false);
    const [webviewError, setWebviewError] = useState<string | null>(null);
    const [demorou, setDemorou] = useState(false);

    const source = useMemo(() => (html ? { html, baseUrl: '' } : undefined), [html]);

    useImperativeHandle(ref, () => ({
      write: (b64) => sendToTerminal(webRef, { t: 'write', b64 }),
      clear: () => sendToTerminal(webRef, { t: 'clear' }),
      fit: () => sendToTerminal(webRef, { t: 'fit' }),
      setFontSize: (size) => sendToTerminal(webRef, { t: 'fontSize', size }),
      setTheme: (theme) => sendToTerminal(webRef, { t: 'theme', theme }),
      focus: () => sendToTerminal(webRef, { t: 'focus' }),
    }));

    useEffect(() => {
      if (!html || ready) return;
      const t = setTimeout(() => setDemorou(true), TIMEOUT_PRONTO_MS);
      return () => clearTimeout(t);
    }, [html, ready]);

    const handleMessage = (e: WebViewMessageEvent) => {
      const msg = parseFromTerminal(e.nativeEvent.data);
      if (!msg) return;
      if (msg.t === 'ready') {
        setReady(true);
        onReady(msg.cols, msg.rows);
      } else if (msg.t === 'input') onInput(msg.b64);
      else if (msg.t === 'resize') onResize(msg.cols, msg.rows);
      else if (msg.t === 'bell') onBell?.();
    };

    const handleWebViewError = (e: WebViewErrorEvent) => {
      const { description, code } = e.nativeEvent;
      const msg = `WebView falhou ao carregar (código ${code}): ${description}`;
      console.error('[TerminalCanvas]', msg);
      setWebviewError(msg);
    };

    const handleWebViewHttpError = (e: WebViewHttpErrorEvent) => {
      const { statusCode, description } = e.nativeEvent;
      const msg = `WebView recebeu erro HTTP ${statusCode}: ${description}`;
      console.error('[TerminalCanvas]', msg);
      setWebviewError(msg);
    };

    // Causa raiz achada do reload misterioso ao digitar: `hideKeyboardAccessoryView` e
    // `keyboardDisplayRequiresUserAction={false}` (removidos abaixo) são implementados em
    // RNCWebViewImpl.m via method swizzling de um SELETOR PRIVADO do WebKit
    // (`_elementDidFocus:userIsInteracting:blurPreviousNode:activityStateChanges:userObject:`),
    // escolhido por faixa de versão de iOS e chamado através de um cast bruto de function pointer
    // — e esse seletor dispara toda vez que um elemento focável ganha foco, exatamente o que
    // acontece quando o textarea escondido do xterm.js recebe o toque pra abrir o teclado. Se a
    // assinatura interna real da versão de iOS do simulador não bate com o cast hardcoded, é
    // undefined behavior — derruba o processo da WebView sem deixar rastro nenhum no Metro (o app
    // "fecha e recarrega sozinho"). `onContentProcessDidTerminate` é o sinal oficial da RNW pra
    // esse tipo de crash nativo — sem handler, o app ficava com uma WebView morta e sem indicação
    // nenhuma de que foi isso (e não um bug de JS) que aconteceu.
    const handleContentProcessDidTerminate = (e: WebViewTerminatedEvent) => {
      console.error('[TerminalCanvas] processo nativo da WebView terminou inesperadamente — recarregando', e.nativeEvent);
      setReady(false);
      webRef.current?.reload();
    };

    if (htmlError) {
      return (
        <View style={styles.center}>
          <Text style={styles.errText}>
            Não consegui carregar o terminal.{'\n'}
            {htmlError}
          </Text>
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
          source={source}
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
          onContentProcessDidTerminate={handleContentProcessDidTerminate}
          style={styles.webview}
        />
        {!ready && demorou ? (
          <View style={styles.overlayAviso} pointerEvents="none">
            <Text style={styles.avisoText}>O terminal carregou mas não respondeu — veja o console (Metro/Xcode/Logcat) por um erro de JS dentro da WebView.</Text>
          </View>
        ) : null}
      </View>
    );
  }),
);

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errText: { color: '#FF453A', fontSize: 13, textAlign: 'center' },
  overlayAviso: { position: 'absolute', left: 14, right: 14, bottom: 14, padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,69,58,0.15)' },
  avisoText: { color: '#FF453A', fontSize: 12, textAlign: 'center' },
});
