// Histórico de undo/redo — lógica pura, sem zustand, para poder testar sem montar loja
// nenhuma (ESPECIFICACAO-APP-RN-EXPO.md §7). Limitado a 80 snapshots; JSON.stringify pro
// histórico porque comparar strings é o que torna barato detectar "mudou de verdade".
export interface History {
  past: string[];
  future: string[];
}

export const emptyHistory: History = { past: [], future: [] };
const CAP = 80;

export function pushSnapshot(h: History, snapshot: string): History {
  return { past: [...h.past, snapshot].slice(-CAP), future: [] };
}

export interface HistoryStep {
  history: History;
  snapshot: string;
}

export function undoStep(h: History, currentSnapshot: string): HistoryStep | null {
  if (!h.past.length) return null;
  const snapshot = h.past[h.past.length - 1];
  return {
    snapshot,
    history: { past: h.past.slice(0, -1), future: [currentSnapshot, ...h.future] },
  };
}

export function redoStep(h: History, currentSnapshot: string): HistoryStep | null {
  if (!h.future.length) return null;
  const snapshot = h.future[0];
  return {
    snapshot,
    history: { past: [...h.past, currentSnapshot], future: h.future.slice(1) },
  };
}
