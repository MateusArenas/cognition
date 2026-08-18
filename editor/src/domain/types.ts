// Tipos do domínio. Ver docs/04-dominio.md e ESPECIFICACAO-APP-RN-EXPO.md §6.1.
// domain/ é TypeScript puro: nada aqui importa de features/, design/ ou store/.

export type DocKind = 'flow' | 'er' | 'raw' | 'md';

export type ShapeKey =
  | 'rect' | 'round' | 'stadium' | 'subroutine' | 'cylinder' | 'circle'
  | 'doublecirc' | 'rhombus' | 'hexagon' | 'parallel' | 'parallelR'
  | 'trapez' | 'trapezR';

export type LinkKey =
  | 'arrow' | 'open' | 'dotted' | 'dottedO' | 'thick' | 'thickO'
  | 'cross' | 'circleE' | 'bi';

export type Direction = 'TD' | 'TB' | 'LR' | 'BT' | 'RL';
export type ColumnKey = 'PK' | 'FK' | 'UK';

export interface FlowNode { id: string; label: string; shape: ShapeKey; cls: string | null }
export interface FlowEdge { id: string; from: string; to: string; label: string; type: LinkKey }
export interface FlowGroup { id: string; label: string; nodes: string[]; direction: Direction | null }
export interface NodeClass { id: string; fill: string | null; stroke: string | null; color: string | null; width: number }

export interface Column { type: string; name: string; keys: ColumnKey[]; note: string }
export interface Table { id: string; label: string; cols: Column[] }
export interface Relation {
  id: string; from: string; to: string;
  cardL: '||' | '|o' | '}o' | '}|';
  cardR: '||' | 'o|' | 'o{' | '|{';
  identifying: boolean; label: string;
}

interface Base { id: string; nome: string; criadoEm: number; atualizadoEm: number }

export interface FlowDoc extends Base {
  tipo: 'flow'; direction: Direction;
  nodes: FlowNode[]; edges: FlowEdge[]; groups: FlowGroup[]; classes: NodeClass[];
}
export interface ErDoc extends Base {
  tipo: 'er'; tables: Table[]; relations: Relation[];
}
export interface RawDoc extends Base {
  tipo: 'raw'; kind: string; // rótulo amigável: "Sequência", "Gantt"
  code: string;
}
export interface MdDoc extends Base {
  tipo: 'md'; md: string;
}
export type Doc = FlowDoc | ErDoc | RawDoc | MdDoc;

export type Selection =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'table'; id: string }
  | { kind: 'col'; id: string } // "TABELA#3"
  | { kind: 'rel'; id: string }
  | { kind: 'txt'; id: string }; // "inicio:fim" em offsets de caractere
