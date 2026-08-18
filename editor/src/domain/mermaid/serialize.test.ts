import { describe, expect, it } from 'vitest';
import { parseMermaid } from './parse';
import { serialize } from './serialize';
import { templateER, templateFlow } from './templates';

const TEMPLATES = [templateFlow, templateER];

describe('round-trip serialize -> parse -> serialize', () => {
  it.each(TEMPLATES)('preserva o template %#', (tpl) => {
    const a = serialize(tpl());
    const doc = parseMermaid(a);
    expect(serialize(doc)).toBe(a);
  });

  it('preserva qualquer texto raw (a exceção da regra de ouro, §6.2)', () => {
    const texto = 'sequenceDiagram\n    A->>B: oi\n    B-->>A: oi de volta';
    const doc = parseMermaid(texto);
    expect(doc.tipo).toBe('raw');
    expect(serialize(doc)).toBe(texto);
  });
});
