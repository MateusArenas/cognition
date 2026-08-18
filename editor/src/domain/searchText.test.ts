import { describe, expect, it } from 'vitest';
import { extractSearchText, subtipoDe } from '@/domain/searchText';
import { templateER, templateFlow } from '@/domain/mermaid/templates';
import { blankRaw } from '@/domain/mermaid/factory';

// Só a parte pura de storage.ts — o resto depende do runtime nativo do SQLite, que não existe
// neste ambiente de teste (ver docs/13-qualidade-e-testes.md).
describe('extractSearchText', () => {
  it('inclui rótulos de nó e aresta pra fluxograma', () => {
    const texto = extractSearchText(templateFlow());
    expect(texto).toContain('Conferir nota fiscal');
  });

  it('inclui nomes de tabela e coluna pro ER', () => {
    const texto = extractSearchText(templateER());
    expect(texto).toContain('CLIENTE');
    expect(texto).toContain('razao_social');
  });
});

describe('subtipoDe', () => {
  it('só documentos raw têm subtipo', () => {
    expect(subtipoDe(blankRaw('t', 'Sequência', 'sequenceDiagram'))).toBe('Sequência');
    expect(subtipoDe(templateFlow())).toBeNull();
  });
});
