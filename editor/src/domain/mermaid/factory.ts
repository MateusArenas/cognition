import type { ErDoc, FlowDoc, MdDoc, RabiscoDoc, RawDoc } from '../types';
import { newDocId } from '../id';

function base() {
  const now = Date.now();
  return { id: newDocId(), criadoEm: now, atualizadoEm: now };
}

export function blankFlow(nome?: string): FlowDoc {
  return {
    ...base(),
    tipo: 'flow',
    nome: nome || 'Novo fluxograma',
    direction: 'TD',
    nodes: [],
    edges: [],
    groups: [],
    classes: [],
  };
}

export function blankER(nome?: string): ErDoc {
  return {
    ...base(),
    tipo: 'er',
    nome: nome || 'Novo modelo relacional',
    tables: [],
    relations: [],
  };
}

export function blankRaw(nome: string, kind: string, code: string): RawDoc {
  return {
    ...base(),
    tipo: 'raw',
    nome: nome || 'Diagrama',
    kind: kind || 'Código Mermaid',
    code: code || '',
  };
}

export function blankMd(nome: string, md: string): MdDoc {
  return {
    ...base(),
    tipo: 'md',
    nome: nome || 'Novo documento',
    md: md || '',
  };
}

export function blankRabisco(nome?: string): RabiscoDoc {
  return {
    ...base(),
    tipo: 'rabisco',
    nome: nome || 'Novo rabisco',
    elements: [],
  };
}
