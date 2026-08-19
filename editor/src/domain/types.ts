// Tipos do domínio. Ver docs/04-dominio.md e ESPECIFICACAO-APP-RN-EXPO.md §6.1.
// domain/ é TypeScript puro: nada aqui importa de features/, design/ ou store/.

export type DocKind = 'flow' | 'er' | 'raw' | 'md' | 'rabisco';

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

// Rabisco (docs/16-rabisco.md) — mesmo shape do protótipo de referência (whiteboard-ios.html)
// de propósito: um .json/.svg exportado de lá tem que continuar abrindo aqui sem tradução.
export type RabiscoElementType = 'rect' | 'diamond' | 'ellipse' | 'line' | 'arrow' | 'draw' | 'text';
export type RabiscoFillStyle = 'hachure' | 'cross' | 'solid';
export type RabiscoStrokeStyle = 'solid' | 'dashed' | 'dotted';
export type RabiscoArrowType = 'straight' | 'curved' | 'elbow';
export type RabiscoFontFamily = 'sans' | 'serif' | 'mono';
export type RabiscoTextAlign = 'left' | 'center' | 'right';
export interface RabiscoBinding { id: string; fx?: number; fy?: number }

export interface RabiscoElement {
  id: string; type: RabiscoElementType; x: number; y: number; w: number; h: number;
  points: [number, number][] | null;
  text: string; labelColor: string;
  edges: 'sharp' | 'round';
  arrowType: RabiscoArrowType;
  startBinding: RabiscoBinding | null; endBinding: RabiscoBinding | null;
  seed: number; version: number;
  strokeColor: string; bgColor: string; fillStyle: RabiscoFillStyle;
  strokeWidth: number; strokeStyle: RabiscoStrokeStyle; roughness: number; opacity: number; fontSize: number;
  fontFamily: RabiscoFontFamily; textAlign: RabiscoTextAlign;
  // Radianos, não graus — bate direto com o `transform: [{ rotate }]` do Skia (Canvas.tsx) sem
  // converter a cada render; só vira grau na hora de mostrar o rótulo pro usuário (arrastando a
  // alça de rotação). Extensão deliberada, sem equivalente no protótipo de referência.
  rotation: number;
  // Elementos "juntados" (botão de agrupar, seleção múltipla) compartilham o mesmo `groupId` —
  // tocar em qualquer um deles seleciona/move/duplica/rotaciona o grupo inteiro como se fosse
  // um elemento só. `null` = elemento solto, não agrupado (a maioria).
  groupId: string | null;
}

export interface RabiscoDoc extends Base {
  tipo: 'rabisco'; elements: RabiscoElement[];
}

export type Doc = FlowDoc | ErDoc | RawDoc | MdDoc | RabiscoDoc;

export type Selection =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'group'; id: string } // subgraph do fluxograma
  | { kind: 'table'; id: string }
  | { kind: 'col'; id: string } // "TABELA#3"
  | { kind: 'rel'; id: string }
  | { kind: 'txt'; id: string }; // "inicio:fim" em offsets de caractere
