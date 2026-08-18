import { describe, expect, it } from 'vitest';
import { tokenize } from './highlight';
import { serialize } from '@/domain/mermaid/serialize';
import { templateER, templateFlow } from '@/domain/mermaid/templates';

function reconstroi(code: string): string {
  return tokenize(code).map((t) => t.text).join('');
}

describe('tokenize — identidade byte a byte', () => {
  it('reconstrói exatamente o texto original', () => {
    const amostras = [
      serialize(templateFlow()),
      serialize(templateER()),
      'sequenceDiagram\n    A->>B: "oi \\"mundo\\""\n    Note over A,B: 42.5 itens',
      '%% comentário\nflowchart TD\n  A[x] --> B{y}',
      '',
      '   \n\n  ',
    ];
    amostras.forEach((code) => expect(reconstroi(code)).toBe(code));
  });
});

describe('tokenize — classificação', () => {
  it('reconhece comentário, string, palavra-chave e número', () => {
    const tokens = tokenize('%% nota\nflowchart TD\nA["rótulo"] --- B\nqtd 42');
    expect(tokens.find((t) => t.text === '%% nota')?.type).toBe('com');
    expect(tokens.find((t) => t.text === '"rótulo"')?.type).toBe('str');
    expect(tokens.find((t) => t.text === 'flowchart')?.type).toBe('kw');
    expect(tokens.find((t) => t.text === '42')?.type).toBe('num');
  });

  it('reconhece cardinalidade do ER', () => {
    const tokens = tokenize('A ||--o{ B : tem');
    expect(tokens.find((t) => t.text === '||--o{')?.type).toBe('card');
  });
});
