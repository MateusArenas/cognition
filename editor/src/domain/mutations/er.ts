import type { Column, ErDoc, Relation } from '../types';
import { uid } from '../id';

export function addTable(doc: ErDoc, id: string, label?: string): ErDoc {
  if (doc.tables.some((t) => t.id === id)) return doc;
  const d = structuredClone(doc);
  d.tables.push({ id, label: label || id, cols: [] });
  return d;
}

export function removeTable(doc: ErDoc, id: string): ErDoc {
  const d = structuredClone(doc);
  d.tables = d.tables.filter((t) => t.id !== id);
  d.relations = d.relations.filter((r) => r.from !== id && r.to !== id);
  return d;
}

export function renameTable(doc: ErDoc, de: string, para: string): ErDoc {
  if (doc.tables.some((t) => t.id === para)) return doc;
  const d = structuredClone(doc);
  const t = d.tables.find((x) => x.id === de);
  if (!t) return doc;
  t.id = para;
  d.relations.forEach((r) => {
    if (r.from === de) r.from = para;
    if (r.to === de) r.to = para;
  });
  return d;
}

export function addColumn(doc: ErDoc, tableId: string, col: Column): ErDoc {
  const d = structuredClone(doc);
  const t = d.tables.find((x) => x.id === tableId);
  if (!t) return doc;
  t.cols.push(col);
  return d;
}

export function removeColumn(doc: ErDoc, tableId: string, idx: number): ErDoc {
  const d = structuredClone(doc);
  const t = d.tables.find((x) => x.id === tableId);
  if (!t) return doc;
  t.cols.splice(idx, 1);
  return d;
}

export function updateColumn(doc: ErDoc, tableId: string, idx: number, patch: Partial<Column>): ErDoc {
  const d = structuredClone(doc);
  const t = d.tables.find((x) => x.id === tableId);
  if (!t || !t.cols[idx]) return doc;
  t.cols[idx] = { ...t.cols[idx], ...patch };
  return d;
}

export function addRelation(doc: ErDoc, rel: Omit<Relation, 'id'>): ErDoc {
  const d = structuredClone(doc);
  d.relations.push({ ...rel, id: uid('r') });
  return d;
}

export function removeRelation(doc: ErDoc, id: string): ErDoc {
  const d = structuredClone(doc);
  d.relations = d.relations.filter((r) => r.id !== id);
  return d;
}

export function setRelationCardinality(doc: ErDoc, id: string, cardL: Relation['cardL'], cardR: Relation['cardR']): ErDoc {
  const d = structuredClone(doc);
  const r = d.relations.find((x) => x.id === id);
  if (!r) return doc;
  r.cardL = cardL;
  r.cardR = cardR;
  return d;
}

// Mesma cardinalidade, símbolo do outro lado — precisa disso pra inverter sem trocar o
// significado (§10, tabela CARD_L/CARD_R em domain/mermaid/cardinality.ts).
const L_TO_R: Record<Relation['cardL'], Relation['cardR']> = { '||': '||', '|o': 'o|', '}o': 'o{', '}|': '|{' };
const R_TO_L: Record<Relation['cardR'], Relation['cardL']> = { '||': '||', 'o|': '|o', 'o{': '}o', '|{': '}|' };

export function invertRelation(doc: ErDoc, id: string): ErDoc {
  const d = structuredClone(doc);
  const r = d.relations.find((x) => x.id === id);
  if (!r) return doc;
  [r.from, r.to] = [r.to, r.from];
  const novoCardL = R_TO_L[r.cardR];
  const novoCardR = L_TO_R[r.cardL];
  r.cardL = novoCardL;
  r.cardR = novoCardR;
  return d;
}

function freeTableId(doc: ErDoc, base: string): string {
  let i = 2;
  let id = `${base}_${i}`;
  while (doc.tables.some((t) => t.id === id)) { i++; id = `${base}_${i}`; }
  return id;
}

export function duplicateTable(doc: ErDoc, id: string): ErDoc {
  const t = doc.tables.find((x) => x.id === id);
  if (!t) return doc;
  const d = structuredClone(doc);
  const novoId = freeTableId(d, id);
  d.tables.push({ ...structuredClone(t), id: novoId, label: novoId });
  return d;
}
