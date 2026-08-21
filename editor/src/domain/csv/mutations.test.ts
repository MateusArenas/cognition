import { describe, expect, it } from 'vitest';
import type { CsvDoc } from '../types';
import {
  clearRange,
  deleteCols,
  deleteRows,
  fillDown,
  insertCol,
  insertRow,
  pasteRange,
  setCell,
  setColWidth,
  setDelimiter,
  sortBy,
  toggleHeaderRow,
  toggleWrap,
} from './mutations';

function makeDoc(cells: string[][], opts: Partial<CsvDoc> = {}): CsvDoc {
  return {
    id: 'doc1',
    nome: 'Teste',
    criadoEm: 0,
    atualizadoEm: 0,
    tipo: 'csv',
    cells,
    headerRow: false,
    wrap: false,
    colWidths: cells[0].map(() => 104),
    delimiter: ',',
    ...opts,
  };
}

describe('setCell', () => {
  it('escreve o valor na célula', () => {
    const d = makeDoc([['a', 'b']]);
    const d2 = setCell(d, 0, 1, 'z');
    expect(d2.cells[0]).toEqual(['a', 'z']);
  });
  it('é no-op (mesma referência) quando o valor não muda', () => {
    const d = makeDoc([['a', 'b']]);
    expect(setCell(d, 0, 0, 'a')).toBe(d);
  });
  it('é no-op fora dos limites da tabela', () => {
    const d = makeDoc([['a', 'b']]);
    expect(setCell(d, 5, 5, 'z')).toBe(d);
  });
  it('nunca muta o doc original', () => {
    const d = makeDoc([['a', 'b']]);
    setCell(d, 0, 0, 'mudou');
    expect(d.cells[0][0]).toBe('a');
  });
});

describe('insertRow / insertCol', () => {
  it('insere linha em branco na posição pedida', () => {
    const d = makeDoc([['a', 'b'], ['c', 'd']]);
    const d2 = insertRow(d, 1);
    expect(d2.cells).toEqual([['a', 'b'], ['', ''], ['c', 'd']]);
  });
  it('insere coluna em branco e expande colWidths', () => {
    const d = makeDoc([['a', 'b'], ['c', 'd']]);
    const d2 = insertCol(d, 1);
    expect(d2.cells).toEqual([['a', '', 'b'], ['c', '', 'd']]);
    expect(d2.colWidths).toHaveLength(3);
  });
});

describe('deleteRows / deleteCols', () => {
  it('apaga o intervalo de linhas pedido', () => {
    const d = makeDoc([['1'], ['2'], ['3']]);
    expect(deleteRows(d, 0, 1).cells).toEqual([['3']]);
  });
  it('nunca deixa a tabela com 0 linhas — é no-op', () => {
    const d = makeDoc([['1'], ['2']]);
    expect(deleteRows(d, 0, 1)).toBe(d);
  });
  it('apaga o intervalo de colunas pedido', () => {
    const d = makeDoc([['a', 'b', 'c']]);
    expect(deleteCols(d, 1, 1).cells).toEqual([['a', 'c']]);
  });
  it('nunca deixa a tabela com 0 colunas — é no-op', () => {
    const d = makeDoc([['a']]);
    expect(deleteCols(d, 0, 0)).toBe(d);
  });
});

describe('clearRange', () => {
  it('esvazia só o intervalo pedido', () => {
    const d = makeDoc([['a', 'b'], ['c', 'd']]);
    const d2 = clearRange(d, 0, 0, 1, 0);
    expect(d2.cells).toEqual([['', 'b'], ['', 'd']]);
  });
});

describe('fillDown', () => {
  it('replica valor literal pra baixo', () => {
    const d = makeDoc([['x'], [''], ['']]);
    const d2 = fillDown(d, 0, 0, 2, 0);
    expect(d2.cells.map((r) => r[0])).toEqual(['x', 'x', 'x']);
  });
  it('desloca referência de fórmula relativa a cada linha', () => {
    const d = makeDoc([['=A1'], [''], ['']]);
    const d2 = fillDown(d, 0, 0, 2, 0);
    expect(d2.cells.map((r) => r[0])).toEqual(['=A1', '=A2', '=A3']);
  });
  it('é no-op numa seleção de uma linha só', () => {
    const d = makeDoc([['x']]);
    expect(fillDown(d, 0, 0, 0, 0)).toBe(d);
  });
});

describe('sortBy', () => {
  it('ordena numericamente, crescente', () => {
    const d = makeDoc([['3'], ['1'], ['2']]);
    expect(sortBy(d, 0, 1).cells.map((r) => r[0])).toEqual(['1', '2', '3']);
  });
  it('ordena numericamente, decrescente', () => {
    const d = makeDoc([['3'], ['1'], ['2']]);
    expect(sortBy(d, 0, -1).cells.map((r) => r[0])).toEqual(['3', '2', '1']);
  });
  it('mantém a linha de cabeçalho fixa no topo', () => {
    const d = makeDoc([['Nome'], ['c'], ['a'], ['b']], { headerRow: true });
    expect(sortBy(d, 0, 1).cells.map((r) => r[0])).toEqual(['Nome', 'a', 'b', 'c']);
  });
  it('ordena texto com localeCompare pt-BR quando não é numérico', () => {
    const d = makeDoc([['banana'], ['abacaxi'], ['cereja']]);
    expect(sortBy(d, 0, 1).cells.map((r) => r[0])).toEqual(['abacaxi', 'banana', 'cereja']);
  });
});

describe('setColWidth / toggleWrap / toggleHeaderRow / setDelimiter', () => {
  it('setColWidth muda só a coluna pedida', () => {
    const d = makeDoc([['a', 'b']]);
    expect(setColWidth(d, 1, 200).colWidths).toEqual([104, 200]);
  });
  it('toggleWrap inverte', () => {
    const d = makeDoc([['a']]);
    expect(toggleWrap(d).wrap).toBe(true);
    expect(toggleWrap(toggleWrap(d)).wrap).toBe(false);
  });
  it('toggleHeaderRow inverte', () => {
    const d = makeDoc([['a']]);
    expect(toggleHeaderRow(d).headerRow).toBe(true);
  });
  it('setDelimiter troca o separador preferido', () => {
    const d = makeDoc([['a']]);
    expect(setDelimiter(d, ';').delimiter).toBe(';');
  });
});

describe('pasteRange', () => {
  it('cola dentro dos limites existentes', () => {
    const d = makeDoc([['a', 'b'], ['c', 'd']]);
    const d2 = pasteRange(d, 0, 0, [['x', 'y']]);
    expect(d2.cells[0]).toEqual(['x', 'y']);
  });
  it('cresce linhas quando o bloco colado não cabe', () => {
    const d = makeDoc([['a']]);
    const d2 = pasteRange(d, 0, 0, [['1'], ['2'], ['3']]);
    expect(d2.cells).toHaveLength(3);
  });
  it('cresce colunas (e colWidths) quando o bloco colado não cabe', () => {
    const d = makeDoc([['a']]);
    const d2 = pasteRange(d, 0, 0, [['x', 'y', 'z']]);
    expect(d2.cells[0]).toEqual(['x', 'y', 'z']);
    expect(d2.colWidths).toHaveLength(3);
  });
  it('bloco vazio é no-op', () => {
    const d = makeDoc([['a']]);
    expect(pasteRange(d, 0, 0, [])).toBe(d);
  });
});
