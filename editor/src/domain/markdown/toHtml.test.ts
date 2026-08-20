import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './render';
import { mdToHtml } from './toHtml';

function html(md: string): string {
  return mdToHtml('Título', renderMarkdown(md));
}

describe('domain/markdown/toHtml — mdToHtml', () => {
  it('gera um documento HTML válido com o título no <title>', () => {
    const out = html('# Oi');
    expect(out).toMatch(/^<!doctype html>/);
    expect(out).toContain('<title>Título</title>');
    expect(out).toContain('<h1>Oi</h1>');
  });

  it('negrito/itálico/code viram tags inline', () => {
    const out = html('**forte** e *ênfase* e `codigo`');
    expect(out).toContain('<strong>forte</strong>');
    expect(out).toContain('<em>ênfase</em>');
    expect(out).toContain('<code>codigo</code>');
  });

  it('escapa HTML dentro do texto (sem injeção)', () => {
    const out = html('<script>alert(1)</script>');
    expect(out).not.toContain('<script>alert(1)</script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('tarefa marcada vira checkbox .done', () => {
    const out = html('- [x] feita\n- [ ] pendente');
    expect(out).toContain('box done');
    expect((out.match(/class="box /g) || []).length).toBe(2);
  });

  it('tabela vira <table> com alinhamento por coluna', () => {
    const out = html('| A | B |\n| :-- | --: |\n| 1 | 2 |');
    expect(out).toContain('<table>');
    expect(out).toContain('text-align:left');
    expect(out).toContain('text-align:right');
  });

  it('bloco ```mermaid``` sai como código rotulado, não como diagrama', () => {
    const out = html('```mermaid\nflowchart TD\n  A --> B\n```');
    expect(out).toContain('mermaid-src');
    expect(out).toContain('flowchart TD');
  });
});
