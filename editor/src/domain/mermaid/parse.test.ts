import { describe, expect, it } from 'vitest';
import { SHAPES } from './shapes';
import { LINKS } from './links';
import { parseFlow, parseMermaid } from './parse';
import type { ShapeKey } from '../types';

describe('parseFlow — formas', () => {
  (Object.keys(SHAPES) as ShapeKey[]).forEach((shape) => {
    it(`reconhece a forma ${shape}`, () => {
      const s = SHAPES[shape];
      const lines = ['flowchart TD', `A${s.open}"rótulo"${s.close}`];
      const d = parseFlow(lines);
      expect(d.nodes).toHaveLength(1);
      expect(d.nodes[0].shape).toBe(shape);
      expect(d.nodes[0].label).toBe('rótulo');
    });
  });
});

describe('parseFlow — arestas', () => {
  Object.entries(LINKS).forEach(([key, def]) => {
    it(`reconhece a aresta ${key} (${def.op})`, () => {
      const lines = ['flowchart TD', `A ${def.op} B`];
      const d = parseFlow(lines);
      expect(d.edges).toHaveLength(1);
      expect(d.edges[0].type).toBe(key);
      expect(d.edges[0].from).toBe('A');
      expect(d.edges[0].to).toBe('B');
    });
  });

  it('lê o rótulo da aresta em |texto|', () => {
    const d = parseFlow(['flowchart TD', 'A -->|"sim"| B']);
    expect(d.edges[0].label).toBe('sim');
  });

  it('encadeia A --> B --> C', () => {
    const d = parseFlow(['flowchart TD', 'A --> B --> C']);
    expect(d.edges).toHaveLength(2);
    expect(d.edges[1].from).toBe('B');
    expect(d.edges[1].to).toBe('C');
  });
});

describe('parseFlow — subgraph e classDef', () => {
  it('agrupa nós dentro de subgraph', () => {
    const d = parseFlow(['flowchart TD', 'subgraph g1["Grupo"]', 'A["a"]', 'end']);
    expect(d.groups).toHaveLength(1);
    expect(d.groups[0].nodes).toEqual(['A']);
  });

  it('aplica classDef + class', () => {
    const d = parseFlow(['flowchart TD', 'classDef ok fill:#0f0,stroke:#000,stroke-width:3px', 'class A ok']);
    expect(d.classes[0]).toMatchObject({ id: 'ok', fill: '#0f0', stroke: '#000', width: 3 });
    expect(d.nodes.find((n) => n.id === 'A')?.cls).toBe('ok');
  });
});

describe('parseMermaid — dispatcher', () => {
  it('nunca lança em tipo desconhecido (vira raw)', () => {
    const d = parseMermaid('gantt\n    title x');
    expect(d.tipo).toBe('raw');
  });

  it('lança em código vazio', () => {
    expect(() => parseMermaid('')).toThrow();
  });
});
