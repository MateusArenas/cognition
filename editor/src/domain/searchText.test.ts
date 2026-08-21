import { describe, expect, it } from 'vitest';
import { extractSearchText, subtipoDe } from '@/domain/searchText';
import { templateER, templateFlow } from '@/domain/mermaid/templates';
import { blankCsv, blankRaw } from '@/domain/mermaid/factory';

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

  it('inclui o conteúdo das células pra tabelas CSV', () => {
    const doc = blankCsv('Estoque');
    doc.cells[0][0] = 'Pastilha de freio';
    expect(extractSearchText(doc)).toContain('Pastilha de freio');
    expect(extractSearchText(doc)).toContain('Estoque');
  });
});

describe('subtipoDe', () => {
  it('só documentos raw têm subtipo', () => {
    expect(subtipoDe(blankRaw('t', 'Sequência', 'sequenceDiagram'))).toBe('Sequência');
    expect(subtipoDe(templateFlow())).toBeNull();
    expect(subtipoDe(blankCsv('t'))).toBeNull();
  });
});
