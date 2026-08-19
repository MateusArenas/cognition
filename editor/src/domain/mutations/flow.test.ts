import { describe, expect, it } from 'vitest';
import { addEdge, addGroup, addNode, duplicateNode, invertEdge, removeGroup, removeNode, renameGroup, renameNode, setNodeGroup } from './flow';
import { blankFlow } from '../mermaid/factory';

function withNodes() {
  let d = blankFlow('t');
  d = addNode(d, { id: 'A', label: 'A', shape: 'rect', cls: null });
  d = addNode(d, { id: 'B', label: 'B', shape: 'rect', cls: null });
  d = addEdge(d, 'A', 'B');
  return d;
}

describe('mutations/flow', () => {
  it('renameNode atualiza arestas e grupos', () => {
    const d = withNodes();
    const r = renameNode(d, 'A', 'X');
    expect(r.nodes.find((n) => n.id === 'X')).toBeTruthy();
    expect(r.edges[0].from).toBe('X');
  });

  it('renameNode é no-op se o id de destino já existe', () => {
    const d = withNodes();
    expect(renameNode(d, 'A', 'B')).toBe(d);
  });

  it('removeNode remove o nó e as arestas ligadas a ele', () => {
    const d = withNodes();
    const r = removeNode(d, 'A');
    expect(r.nodes).toHaveLength(1);
    expect(r.edges).toHaveLength(0);
  });

  it('duplicateNode cria uma cópia com id novo', () => {
    const d = withNodes();
    const r = duplicateNode(d, 'A');
    expect(r.nodes).toHaveLength(3);
    const copia = r.nodes[2];
    expect(copia.label).toBe('A');
    expect(copia.id).not.toBe('A');
  });

  it('invertEdge troca from/to', () => {
    const d = withNodes();
    const r = invertEdge(d, d.edges[0].id);
    expect(r.edges[0].from).toBe('B');
    expect(r.edges[0].to).toBe('A');
  });

  it('addGroup cria o grupo e atribui os nós dados', () => {
    const d = withNodes();
    const r = addGroup(d, 'Armazém', ['A', 'B']);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].label).toBe('Armazém');
    expect(r.groups[0].nodes).toEqual(['A', 'B']);
  });

  it('addGroup ignora ids de nó que não existem', () => {
    const d = withNodes();
    const r = addGroup(d, 'G', ['A', 'Z']);
    expect(r.groups[0].nodes).toEqual(['A']);
  });

  it('renameGroup só troca o label', () => {
    const d = addGroup(withNodes(), 'G', ['A']);
    const r = renameGroup(d, d.groups[0].id, 'Novo nome');
    expect(r.groups[0].label).toBe('Novo nome');
    expect(r.groups[0].nodes).toEqual(['A']);
  });

  it('renameGroup é no-op se o grupo não existe', () => {
    const d = withNodes();
    expect(renameGroup(d, 'ghost', 'x')).toBe(d);
  });

  it('removeGroup tira só o grupo — os nós continuam existindo', () => {
    const d = addGroup(withNodes(), 'G', ['A']);
    const r = removeGroup(d, d.groups[0].id);
    expect(r.groups).toHaveLength(0);
    expect(r.nodes.find((n) => n.id === 'A')).toBeTruthy();
  });

  it('setNodeGroup move um nó de um grupo pra outro (sem ficar em dois)', () => {
    let d = addGroup(withNodes(), 'G1', ['A']);
    d = addGroup(d, 'G2', []);
    const g1 = d.groups[0].id, g2 = d.groups[1].id;
    const r = setNodeGroup(d, 'A', g2);
    expect(r.groups.find((g) => g.id === g1)?.nodes).toEqual([]);
    expect(r.groups.find((g) => g.id === g2)?.nodes).toEqual(['A']);
  });

  it('setNodeGroup com null tira o nó de qualquer grupo', () => {
    const d = addGroup(withNodes(), 'G', ['A']);
    const r = setNodeGroup(d, 'A', null);
    expect(r.groups[0].nodes).toEqual([]);
  });
});
