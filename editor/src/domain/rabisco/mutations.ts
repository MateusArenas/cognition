// Mutações puras do Rabisco: recebem e devolvem Doc, nunca mutam o original — mesma regra de
// ouro de mutations/flow.ts (docs/04-dominio.md), só que aqui não existe texto Mermaid nenhum
// pra derivar (Rabisco não serializa pra Mermaid, ver domain/mermaid/serialize.ts).
import type { RabiscoDoc, RabiscoElement } from '../types';
import { uid } from '../id';
import { rotateElementAround } from './geom';

export function addElement(doc: RabiscoDoc, element: Omit<RabiscoElement, 'id'> & { id?: string }): RabiscoDoc {
  const d = structuredClone(doc);
  d.elements.push({ ...element, id: element.id || uid('el') });
  return d;
}

export function updateElement(doc: RabiscoDoc, id: string, changes: Partial<RabiscoElement>): RabiscoDoc {
  const d = structuredClone(doc);
  const el = d.elements.find((x) => x.id === id);
  if (!el) return doc;
  Object.assign(el, changes);
  el.version += 1;
  return d;
}

export function removeElement(doc: RabiscoDoc, id: string): RabiscoDoc {
  const d = structuredClone(doc);
  d.elements = d.elements.filter((el) => el.id !== id);
  // Nenhuma seta pode continuar apontando pra um binding que não existe mais.
  d.elements.forEach((el) => {
    if (el.startBinding?.id === id) el.startBinding = null;
    if (el.endBinding?.id === id) el.endBinding = null;
  });
  return d;
}

// Mover é sempre só somar em x/y — vale igual pra forma (x/y = canto) e pra traço/linear
// (x/y = origem, points ficam relativos a ela, então não precisam mudar).
export function moveElement(doc: RabiscoDoc, id: string, dx: number, dy: number): RabiscoDoc {
  const d = structuredClone(doc);
  const el = d.elements.find((x) => x.id === id);
  if (!el) return doc;
  el.x += dx;
  el.y += dy;
  el.version += 1;
  return d;
}

export function resizeElement(doc: RabiscoDoc, id: string, box: { x: number; y: number; w: number; h: number }): RabiscoDoc {
  return updateElement(doc, id, box);
}

// Mover VÁRIOS de uma vez (seleção múltipla, Etapa R4) — UM clone, UM passo de undo, pro grupo
// inteiro; chamar `moveElement` num loop empilharia um passo de undo por elemento.
export function moveElements(doc: RabiscoDoc, ids: string[], dx: number, dy: number): RabiscoDoc {
  if (!ids.length) return doc;
  const set = new Set(ids);
  const d = structuredClone(doc);
  for (const el of d.elements) {
    if (set.has(el.id)) { el.x += dx; el.y += dy; el.version += 1; }
  }
  return d;
}

// Duplica um grupo inteiro de uma vez — UM clone, UM passo de undo (mesma razão de
// `moveElements`: chamar isso num loop, um id por vez, empilharia um passo de undo por
// elemento). Se algum dos ids duplicados tinha `groupId` (elemento "juntado", Etapa R5), as
// cópias ganham um `groupId` NOVO, mas continuam juntas ENTRE SI — senão as cópias "vazariam"
// pro grupo original (duplicar um grupo de 2 viraria um grupo de 4).
export function duplicateElements(doc: RabiscoDoc, ids: string[]): RabiscoDoc {
  if (!ids.length) return doc;
  const set = new Set(ids);
  const d = structuredClone(doc);
  const groupIdMap = new Map<string, string>();
  for (const el of doc.elements) {
    if (!set.has(el.id)) continue;
    const clone = structuredClone(el);
    clone.id = uid('el');
    clone.x += 16; clone.y += 16;
    clone.startBinding = null; clone.endBinding = null;
    if (clone.groupId) {
      if (!groupIdMap.has(clone.groupId)) groupIdMap.set(clone.groupId, uid('grp'));
      clone.groupId = groupIdMap.get(clone.groupId)!;
    }
    d.elements.push(clone);
  }
  return d;
}

// Gira um grupo inteiro em torno de um pivô externo (Etapa R5) — ver `rotateElementAround` em
// geom.ts pro porquê da matemática. UM clone/UM passo de undo pro grupo, igual `moveElements`.
export function rotateGroup(doc: RabiscoDoc, ids: string[], center: { x: number; y: number }, delta: number): RabiscoDoc {
  if (!ids.length || !delta) return doc;
  const set = new Set(ids);
  const d = structuredClone(doc);
  d.elements = d.elements.map((el) => (set.has(el.id) ? { ...rotateElementAround(el, center, delta), version: el.version + 1 } : el));
  return d;
}

// "Juntar" (botão de seleção múltipla, Etapa R5) — todo mundo em `ids` ganha o MESMO `groupId`
// novo; a partir daí, tocar em qualquer um deles seleciona/move/rotaciona o grupo inteiro (ver
// `groupMembers` em Canvas.tsx). Sem "desjuntar" nesta etapa — não foi pedido; desfazer (undo)
// é o caminho pra voltar atrás.
export function groupElements(doc: RabiscoDoc, ids: string[]): RabiscoDoc {
  if (ids.length < 2) return doc;
  const set = new Set(ids);
  const groupId = uid('grp');
  const d = structuredClone(doc);
  for (const el of d.elements) {
    if (set.has(el.id)) { el.groupId = groupId; el.version += 1; }
  }
  return d;
}

// Ordem de camadas = ordem do array (índice maior desenha por cima, ver ElementView em
// Canvas.tsx) — subir/descer é trocar de posição com o vizinho; ir pro topo/fundo é tirar e
// reinserir na ponta.
function reorder(doc: RabiscoDoc, id: string, place: (elements: RabiscoElement[], i: number) => void): RabiscoDoc {
  const i = doc.elements.findIndex((x) => x.id === id);
  if (i === -1) return doc;
  const d = structuredClone(doc);
  place(d.elements, i);
  return d;
}

export function bringForward(doc: RabiscoDoc, id: string): RabiscoDoc {
  return reorder(doc, id, (els, i) => {
    if (i >= els.length - 1) return;
    [els[i], els[i + 1]] = [els[i + 1], els[i]];
  });
}

export function sendBackward(doc: RabiscoDoc, id: string): RabiscoDoc {
  return reorder(doc, id, (els, i) => {
    if (i <= 0) return;
    [els[i], els[i - 1]] = [els[i - 1], els[i]];
  });
}

export function bringToFront(doc: RabiscoDoc, id: string): RabiscoDoc {
  return reorder(doc, id, (els, i) => {
    const [el] = els.splice(i, 1);
    els.push(el);
  });
}

export function sendToBack(doc: RabiscoDoc, id: string): RabiscoDoc {
  return reorder(doc, id, (els, i) => {
    const [el] = els.splice(i, 1);
    els.unshift(el);
  });
}
