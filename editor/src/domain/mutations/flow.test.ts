import { describe, expect, it } from 'vitest';
import { addEdge, addNode, duplicateNode, invertEdge, removeNode, renameNode } from './flow';
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
});
