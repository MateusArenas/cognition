import { beforeEach, describe, expect, it } from 'vitest';
import { useDoc } from './useDoc';
import { renameNode } from '@/domain/mutations/flow';
import { blankFlow } from '@/domain/mermaid/factory';
import type { FlowDoc } from '@/domain/types';

function reset() {
  useDoc.setState({
    doc: blankFlow('t'),
    sel: null,
    history: { past: [], future: [] },
    linkMode: { ativo: false, de: null },
    retornoMd: null,
  });
}

beforeEach(reset);

describe('useDoc — apply/undo/redo', () => {
  it('apply troca o doc e empilha undo', () => {
    useDoc.setState((s) => ({ doc: { ...(s.doc as FlowDoc), nodes: [{ id: 'A', label: 'a', shape: 'rect', cls: null }] } }));
    useDoc.getState().apply((d) => renameNode(d as FlowDoc, 'A', 'B'));

    expect((useDoc.getState().doc as FlowDoc).nodes[0].id).toBe('B');
    expect(useDoc.getState().history.past).toHaveLength(1);
  });

  it('apply não empilha nada quando a mutação é um no-op', () => {
    useDoc.getState().apply((d) => renameNode(d as FlowDoc, 'inexistente', 'X'));
    expect(useDoc.getState().history.past).toHaveLength(0);
  });

  it('undo volta o doc e move pra future; redo desfaz o undo', () => {
    useDoc.setState((s) => ({ doc: { ...(s.doc as FlowDoc), nodes: [{ id: 'A', label: 'a', shape: 'rect', cls: null }] } }));
    useDoc.getState().apply((d) => renameNode(d as FlowDoc, 'A', 'B'));
    useDoc.getState().undo();
    expect((useDoc.getState().doc as FlowDoc).nodes[0].id).toBe('A');
    expect(useDoc.getState().history.future).toHaveLength(1);

    useDoc.getState().redo();
    expect((useDoc.getState().doc as FlowDoc).nodes[0].id).toBe('B');
  });

  it('applyLive muda o doc sem empilhar — digitar não empilha por tecla', () => {
    useDoc.setState((s) => ({ doc: { ...(s.doc as FlowDoc), nome: 'antes' } }));
    useDoc.getState().applyLive((d) => {
      d.nome = 'digitando';
    });
    expect(useDoc.getState().doc.nome).toBe('digitando');
    expect(useDoc.getState().history.past).toHaveLength(0);
  });

  it('commitLive empilha uma vez só, no blur', () => {
    const snapshotAntes = JSON.stringify(useDoc.getState().doc);
    useDoc.getState().applyLive((d) => {
      d.nome = 'x';
    });
    useDoc.getState().applyLive((d) => {
      d.nome = 'xy';
    });
    useDoc.getState().applyLive((d) => {
      d.nome = 'xyz';
    });
    expect(useDoc.getState().history.past).toHaveLength(0);

    useDoc.getState().commitLive(snapshotAntes);
    expect(useDoc.getState().history.past).toHaveLength(1);
  });

  it('commitLive não empilha se nada mudou de fato', () => {
    const snapshot = JSON.stringify(useDoc.getState().doc);
    useDoc.getState().commitLive(snapshot);
    expect(useDoc.getState().history.past).toHaveLength(0);
  });
});
