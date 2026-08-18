import { describe, expect, it } from 'vitest';
import { duplicateLine, removeLine, replaceTextSpan, textSpanAt } from './raw';
import { blankRaw } from '../mermaid/factory';

function doc(code: string) {
  return blankRaw('t', 'Sequência', code);
}

function keyFor(code: string, trecho: string) {
  const ini = code.indexOf(trecho);
  return { kind: 'txt' as const, id: `${ini}:${ini + trecho.length}` };
}

describe('mutations/raw — textSpanAt', () => {
  it('acha a linha em volta do trecho', () => {
    const code = 'linha um\nlinha dois\nlinha três';
    const span = textSpanAt(doc(code), keyFor(code, 'dois'));
    expect(span?.linha).toBe('linha dois');
  });

  it('devolve null para seleção que não é txt', () => {
    expect(textSpanAt(doc('x'), { kind: 'node', id: 'A' })).toBeNull();
  });

  it('devolve null para seleção nula', () => {
    expect(textSpanAt(doc('x'), null)).toBeNull();
  });
});

describe('mutations/raw — edição por offset', () => {
  it('replaceTextSpan troca exatamente o intervalo, byte a byte no resto', () => {
    const code = 'sequenceDiagram\n    A->>B: oi';
    const d = doc(code);
    const span = textSpanAt(d, keyFor(code, 'oi'))!;
    expect(span.texto).toBe('oi');
    const r = replaceTextSpan(d, span, 'olá');
    expect(r.code).toBe('sequenceDiagram\n    A->>B: olá');
  });

  it('duplicateLine repete a linha inteira embaixo', () => {
    const code = 'a\nb\nc';
    const d = doc(code);
    const span = textSpanAt(d, keyFor(code, 'b'))!;
    const r = duplicateLine(d, span);
    expect(r.code).toBe('a\nb\nb\nc');
  });

  it('removeLine tira a linha inteira, sem deixar linha em branco', () => {
    const code = 'a\nb\nc';
    const d = doc(code);
    const span = textSpanAt(d, keyFor(code, 'b'))!;
    const r = removeLine(d, span);
    expect(r.code).toBe('a\nc');
  });
});
