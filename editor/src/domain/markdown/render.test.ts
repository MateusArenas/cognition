import { describe, expect, it } from 'vitest';
import { parseInline, renderMarkdown } from './render';

describe('renderMarkdown — blocos', () => {
  it('offsets do bloco mermaid batem com o recorte do markdown', () => {
    const md = '# Título\n\nTexto antes.\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\nTexto depois.';
    const nodes = renderMarkdown(md);
    const bloco = nodes.find((n) => n.t === 'mermaid');
    expect(bloco).toBeTruthy();
    if (bloco?.t === 'mermaid') {
      expect(md.slice(bloco.ini, bloco.fim)).toBe(bloco.corpo);
      expect(bloco.corpo).toBe('flowchart TD\n  A --> B');
    }
  });

  it('reconhece títulos H1-H4', () => {
    const nodes = renderMarkdown('# um\n## dois\n### três\n#### quatro');
    expect(nodes.map((n) => (n.t === 'heading' ? n.nivel : null))).toEqual([1, 2, 3, 4]);
  });

  it('reconhece régua horizontal', () => {
    expect(renderMarkdown('---')[0]).toEqual({ t: 'hr' });
  });

  it('reconhece bloco de código não-mermaid', () => {
    const nodes = renderMarkdown('```json\n{"a":1}\n```');
    expect(nodes[0]).toEqual({ t: 'code', lang: 'json', corpo: '{"a":1}' });
  });

  it('reconhece tabela com alinhamento', () => {
    const md = '| A | B |\n| :-- | --: |\n| 1 | 2 |';
    const nodes = renderMarkdown(md);
    const t = nodes.find((n) => n.t === 'table');
    expect(t?.t).toBe('table');
    if (t?.t === 'table') {
      expect(t.alinhamento).toEqual(['left', 'right']);
      expect(t.linhas).toHaveLength(1);
    }
  });

  it('lista de tarefa guarda os offsets do marcador, não a ocorrência', () => {
    const md = '- [ ] fazer\n- [x] feito';
    const nodes = renderMarkdown(md);
    expect(nodes[0].t).toBe('list');
    if (nodes[0].t === 'list') {
      const [a, b] = nodes[0].itens;
      expect(a.tarefa?.feita).toBe(false);
      expect(b.tarefa?.feita).toBe(true);
      expect(md.slice(a.tarefa!.ini, a.tarefa!.fim)).toBe(' ');
      expect(md.slice(b.tarefa!.ini, b.tarefa!.fim)).toBe('x');
    }
  });

  it('lista aninhada por indentação vira sublista', () => {
    const md = '- pai\n  - filho';
    const nodes = renderMarkdown(md);
    expect(nodes[0].t).toBe('list');
    if (nodes[0].t === 'list') {
      expect(nodes[0].itens[0].sub?.[0].t).toBe('list');
    }
  });
});

describe('parseInline', () => {
  it('protege code span antes de negrito/itálico — ** dentro de crase não vira negrito', () => {
    const out = parseInline('texto `**não é negrito**` fim');
    expect(out.find((t) => t.t === 'code')).toEqual({ t: 'code', texto: '**não é negrito**' });
  });

  it('reconhece negrito, itálico, riscado e destaque', () => {
    expect(parseInline('**forte**')).toEqual([{ t: 'bold', filhos: [{ t: 'text', texto: 'forte' }] }]);
    expect(parseInline('*ênfase*')).toEqual([{ t: 'italic', filhos: [{ t: 'text', texto: 'ênfase' }] }]);
    expect(parseInline('~~fora~~')).toEqual([{ t: 'strike', filhos: [{ t: 'text', texto: 'fora' }] }]);
    expect(parseInline('==marca==')).toEqual([{ t: 'mark', filhos: [{ t: 'text', texto: 'marca' }] }]);
  });

  it('reconhece link e imagem', () => {
    expect(parseInline('[texto](http://x)')).toEqual([{ t: 'link', href: 'http://x', filhos: [{ t: 'text', texto: 'texto' }] }]);
    expect(parseInline('![alt](img.png)')).toEqual([{ t: 'image', alt: 'alt', src: 'img.png' }]);
  });
});
