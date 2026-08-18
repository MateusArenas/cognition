import { useRef } from 'react';
import { create } from 'zustand';
import type { Doc, MdDoc, Selection } from '@/domain/types';
import { blankFlow } from '@/domain/mermaid/factory';
import { emptyHistory, pushSnapshot, redoStep, undoStep, type History } from './history';

interface RetornoMd {
  doc: MdDoc;
  ini: number;
  fim: number;
}

interface DocState {
  doc: Doc;
  sel: Selection | null;
  history: History;
  linkMode: { ativo: boolean; de: string | null };
  retornoMd: RetornoMd | null;

  openDoc: (doc: Doc) => void;
  /** Empilha undo — para mutações discretas (toque, botão), não digitação. */
  apply: (fn: (d: Doc) => Doc | void) => void;
  /** Digitação: não empilha. Snapshot no onFocus, commitLive no onBlur (ver useLiveField). */
  applyLive: (fn: (d: Doc) => void) => void;
  commitLive: (snapshot: string) => void;
  select: (s: Selection | null) => void;
  undo: () => void;
  redo: () => void;
  setLinkMode: (ativo: boolean, de?: string | null) => void;
  setRetornoMd: (r: RetornoMd | null) => void;
}

// Documento único em memória — é o que a spec chama de "o documento aberto" (§7). Trocar de
// documento (Etapa 13, biblioteca) é só chamar openDoc() com outro Doc.
export const useDoc = create<DocState>((set, get) => ({
  doc: blankFlow('Novo fluxograma'),
  sel: null,
  history: emptyHistory,
  linkMode: { ativo: false, de: null },
  retornoMd: null,

  openDoc: (doc) => set({ doc, sel: null, history: emptyHistory, linkMode: { ativo: false, de: null } }),

  apply: (fn) => {
    const { doc, history } = get();
    const result = fn(doc);
    const next = result === undefined ? doc : result;
    if (next === doc) return; // no-op: mutação pura que decidiu não mudar nada
    set({ doc: { ...next, atualizadoEm: Date.now() }, history: pushSnapshot(history, JSON.stringify(doc)) });
  },

  applyLive: (fn) => {
    set((state) => {
      const draft = structuredClone(state.doc);
      fn(draft);
      draft.atualizadoEm = Date.now();
      return { doc: draft };
    });
  },

  commitLive: (snapshot) => {
    set((state) => {
      if (snapshot === JSON.stringify(state.doc)) return state; // nada mudou de fato
      return { history: pushSnapshot(state.history, snapshot) };
    });
  },

  select: (s) => set({ sel: s }),

  undo: () => {
    const { doc, history } = get();
    const step = undoStep(history, JSON.stringify(doc));
    if (!step) return;
    set({ doc: JSON.parse(step.snapshot), history: step.history, sel: null });
  },

  redo: () => {
    const { doc, history } = get();
    const step = redoStep(history, JSON.stringify(doc));
    if (!step) return;
    set({ doc: JSON.parse(step.snapshot), history: step.history, sel: null });
  },

  setLinkMode: (ativo, de = null) => set({ linkMode: { ativo, de } }),
  setRetornoMd: (r) => set({ retornoMd: r }),
}));

// Campo de texto dispara onChangeText a cada caractere; empilhar undo por tecla torna o
// botão inútil. O padrão: snapshot no onFocus, empilha no onBlur se mudou (§7).
export function useLiveField(ler: (d: Doc) => string, escrever: (d: Doc, v: string) => void) {
  const snap = useRef<string | null>(null);
  const doc = useDoc((s) => s.doc);
  const applyLive = useDoc((s) => s.applyLive);
  const commitLive = useDoc((s) => s.commitLive);

  return {
    value: ler(doc),
    onFocus: () => {
      snap.current = JSON.stringify(useDoc.getState().doc);
    },
    onChangeText: (v: string) => applyLive((d) => escrever(d, v)),
    onBlur: () => {
      if (snap.current) commitLive(snap.current);
      snap.current = null;
    },
  };
}
