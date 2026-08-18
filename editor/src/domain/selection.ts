// Chaves de seleção "kind:id" — corte só no primeiro ":" (ESPECIFICACAO-APP-RN-EXPO.md §10).
// Um split(':') ingênuo quebra em "txt:120:134" e em "col:PEDIDO#2". Foi bug real no protótipo.
import type { Doc, Selection } from './types';

export function parseSelectionKey(chave: string): Selection | null {
  const i = chave.indexOf(':');
  if (i < 0) return null;
  const kind = chave.slice(0, i);
  const id = chave.slice(i + 1);
  if (kind !== 'node' && kind !== 'edge' && kind !== 'table' && kind !== 'col' && kind !== 'rel' && kind !== 'txt') {
    return null;
  }
  return { kind, id } as Selection;
}

export function buildSelectionKey(sel: Selection): string {
  return `${sel.kind}:${sel.id}`;
}

// O runtime do canvas (runtime.shell.html) só recebe `code`, não o Doc estruturado — então
// não tem como saber o id real (uid) de uma aresta/relação, só a ordem em que ela aparece no
// SVG. Como o serializer garante que essa ordem é a mesma de `doc.edges`/`doc.relations`
// (ver docs/04-dominio.md), o runtime manda o ÍNDICE em `sel.id` para 'edge'/'rel', e aqui a
// gente traduz pro id real antes de guardar a seleção — o resto do app nunca vê um índice,
// só ids de verdade, iguais a node/table/col/txt.
export function resolveTapSelection(doc: Doc, raw: Selection | null): Selection | null {
  if (!raw) return null;
  if (raw.kind === 'edge') {
    if (doc.tipo !== 'flow') return null;
    const edge = doc.edges[Number(raw.id)];
    return edge ? { kind: 'edge', id: edge.id } : null;
  }
  if (raw.kind === 'rel') {
    if (doc.tipo !== 'er') return null;
    const rel = doc.relations[Number(raw.id)];
    return rel ? { kind: 'rel', id: rel.id } : null;
  }
  return raw;
}
