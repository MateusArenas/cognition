import { describe, expect, it } from 'vitest';
import { buildSelectionKey, parseSelectionKey, resolveTapSelection } from './selection';
import { templateER, templateFlow } from './mermaid/templates';

describe('parseSelectionKey', () => {
  it('corta só no primeiro ":"', () => {
    expect(parseSelectionKey('txt:120:134')).toEqual({ kind: 'txt', id: '120:134' });
    expect(parseSelectionKey('col:PEDIDO#2')).toEqual({ kind: 'col', id: 'PEDIDO#2' });
  });

  it('rejeita kind desconhecido', () => {
    expect(parseSelectionKey('bogus:1')).toBeNull();
  });

  it('é o inverso de buildSelectionKey', () => {
    const sel = { kind: 'node' as const, id: 'A' };
    expect(parseSelectionKey(buildSelectionKey(sel))).toEqual(sel);
  });
});

describe('resolveTapSelection', () => {
  it('traduz o índice de uma aresta para o id real', () => {
    const doc = templateFlow();
    const resolved = resolveTapSelection(doc, { kind: 'edge', id: '2' });
    expect(resolved).toEqual({ kind: 'edge', id: doc.edges[2].id });
  });

  it('traduz o índice de uma relação para o id real', () => {
    const doc = templateER();
    const resolved = resolveTapSelection(doc, { kind: 'rel', id: '0' });
    expect(resolved).toEqual({ kind: 'rel', id: doc.relations[0].id });
  });

  it('passa node/table/col/txt direto, sem tradução', () => {
    const doc = templateFlow();
    expect(resolveTapSelection(doc, { kind: 'node', id: 'A' })).toEqual({ kind: 'node', id: 'A' });
  });

  it('devolve null para índice fora do intervalo', () => {
    const doc = templateFlow();
    expect(resolveTapSelection(doc, { kind: 'edge', id: '999' })).toBeNull();
  });

  it('devolve null para seleção nula', () => {
    expect(resolveTapSelection(templateFlow(), null)).toBeNull();
  });
});
