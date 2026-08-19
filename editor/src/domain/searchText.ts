// O que entra no índice de busca da biblioteca, por tipo de documento (§15). Fica em
// domain/ (TypeScript puro) e não em services/storage.ts de propósito: storage.ts importa
// expo-sqlite, que puxa react-native e não roda debaixo do vitest — mantendo isso aqui,
// a lógica continua testável sem SQLite nenhum.
import type { Doc } from './types';

export function extractSearchText(doc: Doc): string {
  switch (doc.tipo) {
    case 'flow':
      return [doc.nome, ...doc.nodes.map((n) => n.label), ...doc.edges.map((e) => e.label)].join(' ');
    case 'er':
      return [doc.nome, ...doc.tables.flatMap((t) => [t.id, ...t.cols.map((c) => c.name)])].join(' ');
    case 'raw':
      return [doc.nome, doc.code].join(' ');
    case 'md':
      return [doc.nome, doc.md].join(' ');
    case 'rabisco':
      return [doc.nome, ...doc.elements.filter((e) => e.text).map((e) => e.text)].join(' ');
  }
}

export function subtipoDe(doc: Doc): string | null {
  return doc.tipo === 'raw' ? doc.kind : null;
}
