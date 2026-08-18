// Mutações puras do fluxograma: recebem e devolvem Doc, nunca mutam o original.
// Facilita undo, testes, e evita mutação acidental compartilhada (§6.6).
import type { FlowDoc, FlowNode, LinkKey, ShapeKey } from '../types';
import { uid } from '../id';

const ID_VALIDO = /^[A-Za-z0-9_-]+$/;

export function renameNode(doc: FlowDoc, de: string, para: string): FlowDoc {
  if (!ID_VALIDO.test(para)) return doc;
  if (doc.nodes.some((n) => n.id === para)) return doc;
  const d = structuredClone(doc);
  const n = d.nodes.find((x) => x.id === de);
  if (!n) return doc;
  n.id = para;
  d.edges.forEach((e) => {
    if (e.from === de) e.from = para;
    if (e.to === de) e.to = para;
  });
  d.groups.forEach((g) => {
    const i = g.nodes.indexOf(de);
    if (i >= 0) g.nodes[i] = para;
  });
  return d;
}

export function addNode(doc: FlowDoc, node: Omit<FlowNode, 'id'> & { id?: string }): FlowDoc {
  const id = node.id && ID_VALIDO.test(node.id) && !doc.nodes.some((n) => n.id === node.id) ? node.id : uid('n');
  const d = structuredClone(doc);
  d.nodes.push({ ...node, id });
  return d;
}

export function removeNode(doc: FlowDoc, id: string): FlowDoc {
  const d = structuredClone(doc);
  d.nodes = d.nodes.filter((n) => n.id !== id);
  d.edges = d.edges.filter((e) => e.from !== id && e.to !== id);
  d.groups.forEach((g) => {
    g.nodes = g.nodes.filter((n) => n !== id);
  });
  return d;
}

export function setNodeLabel(doc: FlowDoc, id: string, label: string): FlowDoc {
  const d = structuredClone(doc);
  const n = d.nodes.find((x) => x.id === id);
  if (!n) return doc;
  n.label = label;
  return d;
}

export function setNodeShape(doc: FlowDoc, id: string, shape: ShapeKey): FlowDoc {
  const d = structuredClone(doc);
  const n = d.nodes.find((x) => x.id === id);
  if (!n) return doc;
  n.shape = shape;
  return d;
}

export function setNodeClass(doc: FlowDoc, id: string, cls: string | null): FlowDoc {
  const d = structuredClone(doc);
  const n = d.nodes.find((x) => x.id === id);
  if (!n) return doc;
  n.cls = cls;
  return d;
}

export function addEdge(doc: FlowDoc, from: string, to: string, type: LinkKey = 'arrow', label = ''): FlowDoc {
  if (!doc.nodes.some((n) => n.id === from) || !doc.nodes.some((n) => n.id === to)) return doc;
  const d = structuredClone(doc);
  d.edges.push({ id: uid('e'), from, to, label, type });
  return d;
}

export function removeEdge(doc: FlowDoc, id: string): FlowDoc {
  const d = structuredClone(doc);
  d.edges = d.edges.filter((e) => e.id !== id);
  return d;
}

export function setEdgeLabel(doc: FlowDoc, id: string, label: string): FlowDoc {
  const d = structuredClone(doc);
  const e = d.edges.find((x) => x.id === id);
  if (!e) return doc;
  e.label = label;
  return d;
}

export function setEdgeType(doc: FlowDoc, id: string, type: LinkKey): FlowDoc {
  const d = structuredClone(doc);
  const e = d.edges.find((x) => x.id === id);
  if (!e) return doc;
  e.type = type;
  return d;
}

export function invertEdge(doc: FlowDoc, id: string): FlowDoc {
  const d = structuredClone(doc);
  const e = d.edges.find((x) => x.id === id);
  if (!e) return doc;
  [e.from, e.to] = [e.to, e.from];
  return d;
}

export function duplicateNode(doc: FlowDoc, id: string): FlowDoc {
  const n = doc.nodes.find((x) => x.id === id);
  if (!n) return doc;
  const d = structuredClone(doc);
  d.nodes.push({ ...n, id: uid('n') });
  return d;
}
