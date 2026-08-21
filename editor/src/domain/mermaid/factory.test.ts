import { describe, expect, it } from 'vitest';
import { blankCsv, csvDocFromText } from './factory';

// blankFlow/blankER/blankRaw/blankMd/blankRabisco já são exercitados indiretamente por
// GalleryScreen e pelos testes de outros domínios — só blankCsv (novo) ganha teste dedicado
// aqui, cobrindo as dimensões/defaults que o resto da feature Tabelas depende.
describe('blankCsv', () => {
  it('nasce com nome padrão quando nenhum é passado', () => {
    expect(blankCsv().nome).toBe('Nova tabela');
  });
  it('usa o nome pedido', () => {
    expect(blankCsv('Estoque').nome).toBe('Estoque');
  });
  it('é retangular — toda linha tem a mesma largura de colWidths', () => {
    const d = blankCsv();
    expect(d.cells.every((row) => row.length === d.colWidths.length)).toBe(true);
  });
  it('nasce com cabeçalho ligado e separador vírgula', () => {
    const d = blankCsv();
    expect(d.headerRow).toBe(true);
    expect(d.delimiter).toBe(',');
    expect(d.wrap).toBe(false);
  });
  it('todas as células nascem vazias', () => {
    const d = blankCsv();
    expect(d.cells.flat().every((c) => c === '')).toBe(true);
  });
  it('tipo é csv', () => {
    expect(blankCsv().tipo).toBe('csv');
  });
});

describe('csvDocFromText', () => {
  it('detecta o separador sozinho e monta a tabela', () => {
    const d = csvDocFromText('a;b\n1;2', 'arquivo', true);
    expect(d.delimiter).toBe(';');
    expect(d.cells).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('respeita o separador explícito quando passado', () => {
    const d = csvDocFromText('a,b\n1,2', 'arquivo', true, ',');
    expect(d.delimiter).toBe(',');
  });
  it('headerRow reflete o que foi pedido', () => {
    expect(csvDocFromText('a,b', 'x', true).headerRow).toBe(true);
    expect(csvDocFromText('a,b', 'x', false).headerRow).toBe(false);
  });
  it('colWidths nasce com uma entrada por coluna', () => {
    const d = csvDocFromText('a,b,c\n1,2,3', 'x', true);
    expect(d.colWidths).toHaveLength(3);
  });
});
