import type { ShapeKey } from '../types';

export interface ShapeDef { nome: string; open: string; close: string }

// Ver ESPECIFICACAO-APP-RN-EXPO.md §6 e o protótipo (editor-mermaid.html) para a sintaxe exata.
export const SHAPES: Record<ShapeKey, ShapeDef> = {
  rect: { nome: 'Retângulo', open: '[', close: ']' },
  round: { nome: 'Arredondado', open: '(', close: ')' },
  stadium: { nome: 'Pílula', open: '([', close: '])' },
  subroutine: { nome: 'Sub-rotina', open: '[[', close: ']]' },
  cylinder: { nome: 'Banco', open: '[(', close: ')]' },
  circle: { nome: 'Círculo', open: '((', close: '))' },
  doublecirc: { nome: 'Duplo', open: '(((', close: ')))' },
  rhombus: { nome: 'Decisão', open: '{', close: '}' },
  hexagon: { nome: 'Hexágono', open: '{{', close: '}}' },
  parallel: { nome: 'Dados', open: '[/', close: '/]' },
  parallelR: { nome: 'Dados inv.', open: '[\\', close: '\\]' },
  trapez: { nome: 'Trapézio', open: '[/', close: '\\]' },
  trapezR: { nome: 'Trapézio inv.', open: '[\\', close: '/]' },
};
