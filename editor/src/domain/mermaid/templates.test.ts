import { describe, expect, it } from 'vitest';
import { templateFlow, templateMd } from './templates';
import { serialize } from './serialize';
import { findMermaidBlocks } from '../markdown/blocks';
import { renderMarkdown } from '../markdown/render';

describe('templateMd', () => {
  it('embute um diagrama Mermaid válido, recortável no offset certo (base da ida-e-volta §13.4)', () => {
    const doc = templateMd();
    const blocos = findMermaidBlocks(doc.md);
    expect(blocos).toHaveLength(1);
    expect(doc.md.slice(blocos[0].ini, blocos[0].fim)).toBe(blocos[0].corpo);
    expect(blocos[0].corpo).toBe(serialize(templateFlow()));
  });

  it('renderiza sem lançar e produz pelo menos um título e o bloco mermaid', () => {
    const doc = templateMd();
    const nodes = renderMarkdown(doc.md);
    expect(nodes.some((n) => n.t === 'heading')).toBe(true);
    expect(nodes.some((n) => n.t === 'mermaid')).toBe(true);
  });
});
