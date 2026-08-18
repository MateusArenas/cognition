import type { Column, ErDoc, FlowDoc, Relation, Table } from '../types';

export const nodeById = (d: FlowDoc, id: string) => d.nodes.find((n) => n.id === id);
export const edgeById = (d: FlowDoc, id: string) => d.edges.find((e) => e.id === id);
export const tableById = (d: ErDoc, id: string) => d.tables.find((t) => t.id === id);
export const relById = (d: ErDoc, id: string) => d.relations.find((r) => r.id === id);

// `sel.id` de uma coluna é "TABELA#3" (§6.1) — resolve pro par tabela/coluna real.
export function colunaDe(d: ErDoc, selId: string): { tab: Table; col: Column; idx: number } | null {
  const i = selId.lastIndexOf('#');
  if (i < 0) return null;
  const tab = tableById(d, selId.slice(0, i));
  if (!tab) return null;
  const idx = Number(selId.slice(i + 1));
  const col = tab.cols[idx];
  if (!col) return null;
  return { tab, col, idx };
}
