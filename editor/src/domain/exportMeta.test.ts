import { describe, expect, it } from 'vitest';
import { exportExtension, exportMime, slugFilename } from './exportMeta';
import { blankCsv, blankMd } from './mermaid/factory';
import { templateFlow } from './mermaid/templates';

describe('exportMeta', () => {
  it('.md/text-markdown para documentos, .mmd/text-plain para diagramas', () => {
    expect(exportExtension(blankMd('t', ''))).toBe('.md');
    expect(exportMime(blankMd('t', ''))).toBe('text/markdown');
    expect(exportExtension(templateFlow())).toBe('.mmd');
    expect(exportMime(templateFlow())).toBe('text/plain');
  });

  it('.csv/text-csv para tabelas', () => {
    expect(exportExtension(blankCsv('t'))).toBe('.csv');
    expect(exportMime(blankCsv('t'))).toBe('text/csv');
  });

  it('slugFilename tira acento, espaço e maiúscula', () => {
    expect(slugFilename('Recebimento de Carga')).toBe('recebimento-de-carga');
    expect(slugFilename('Ordem de Compra nº 42')).toBe('ordem-de-compra-n-42');
  });

  it('nunca devolve string vazia', () => {
    expect(slugFilename('')).toBe('documento');
    expect(slugFilename('!!!')).toBe('documento');
  });
});
