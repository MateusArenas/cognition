import { create } from 'zustand';
import { deleteDoc, listDocs, type DocRow } from '@/services/storage';

interface LibraryState {
  docs: DocRow[];
  query: string;
  loading: boolean;
  load: () => Promise<void>;
  setQuery: (q: string) => void;
  remove: (id: string) => Promise<void>;
}

// Biblioteca de verdade (§15) — grade de cartões vem de `docs`, busca por nome/conteúdo via
// `texto_busca` (ver domain/searchText.ts).
export const useLibrary = create<LibraryState>((set, get) => ({
  docs: [],
  query: '',
  loading: false,

  load: async () => {
    set({ loading: true });
    const docs = await listDocs(get().query);
    set({ docs, loading: false });
  },

  setQuery: (q) => {
    set({ query: q });
    get().load();
  },

  remove: async (id) => {
    await deleteDoc(id);
    set((s) => ({ docs: s.docs.filter((d) => d.id !== id) }));
  },
}));
