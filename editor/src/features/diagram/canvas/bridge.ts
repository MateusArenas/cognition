import type { RefObject } from 'react';
import type WebView from 'react-native-webview';
import type { Selection } from '@/domain/types';

// Ver docs/06-canvas.md §8.2. RN -> WebView usa injectJavaScript, nunca postMessage (evita a
// diferença histórica entre document.addEventListener('message') no Android e window no iOS).
export type ToWeb =
  | { t: 'render'; code: string; theme: 'dark' | 'light'; tokens: Record<string, string> }
  | { t: 'select'; sel: Selection | null }
  | { t: 'reveal'; fracaoTopo: number }
  | { t: 'fit' }
  | { t: 'zoomBy'; factor: number }
  | { t: 'exportPng'; scale: number }
  | { t: 'validate'; code: string; reqId: string };

// `sel` em 'tap' pode carregar um índice em vez do id real quando kind é 'edge'/'rel' — o
// runtime não tem o modelo estruturado, só o texto Mermaid (ver a nota no topo de
// runtime.shell.html). resolveTapSelection() em domain/selection.ts faz a tradução.
//
// 'validated' é a base da validação da IA antes de aplicar (§14.3): usa o `mermaid.parse` de
// verdade que já está carregado no runtime, em vez de reimplementar um validador à parte.
// 'elements' só é relevante pra tipo 'raw' (os 23 tipos sem modelo estruturado — flow/er já
// têm a lista de elementos vinda do próprio Doc, não precisam disso). O runtime é quem sabe
// quais trechos de texto a Camada 3 conseguiu mapear como toque, então é ele quem informa —
// ver docs/07-selecao.md.
export type FromWeb =
  | { t: 'ready' }
  | { t: 'tap'; sel: Selection | null; duplo: boolean }
  | { t: 'error'; message: string }
  | { t: 'png'; base64: string }
  | { t: 'validated'; reqId: string; ok: boolean; message?: string }
  | { t: 'elements'; items: { id: string; texto: string }[] }
  | { t: 'zoom'; k: number };

export function sendToWeb(ref: RefObject<WebView | null>, msg: ToWeb) {
  ref.current?.injectJavaScript(`window.__handle(${JSON.stringify(msg)}); true;`);
}

export function parseFromWeb(raw: string): FromWeb | null {
  try {
    const msg = JSON.parse(raw);
    if (msg && typeof msg.t === 'string') return msg as FromWeb;
  } catch {
    // mensagem malformada — ignora em vez de derrubar a tela
  }
  return null;
}
