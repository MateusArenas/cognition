import type { RefObject } from 'react';
import type WebView from 'react-native-webview';

// RN -> WebView usa injectJavaScript, nunca postMessage — mesma convenção de
// features/diagram/canvas/bridge.ts (evita a diferença histórica de evento entre Android e iOS).
export type ToWeb =
  | { t: 'write'; b64: string }
  | { t: 'clear' }
  | { t: 'fit' }
  | { t: 'fontSize'; size: number }
  | { t: 'theme'; theme: Record<string, string> }
  | { t: 'focus' };

export type FromWeb = { t: 'ready'; cols: number; rows: number } | { t: 'input'; b64: string } | { t: 'resize'; cols: number; rows: number } | { t: 'bell' };

export function sendToTerminal(ref: RefObject<WebView | null>, msg: ToWeb) {
  ref.current?.injectJavaScript(`window.__handle(${JSON.stringify(msg)}); true;`);
}

export function parseFromTerminal(raw: string): FromWeb | null {
  try {
    const msg = JSON.parse(raw);
    if (msg && typeof msg.t === 'string') return msg as FromWeb;
  } catch {
    // mensagem malformada — ignora em vez de derrubar a tela
  }
  return null;
}
