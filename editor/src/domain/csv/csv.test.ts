import { describe, expect, it } from 'vitest';
import { detectDelim, parseCSV, toCSV } from './csv';

describe('detectDelim', () => {
  it('detecta vírgula', () => expect(detectDelim('a,b,c\n1,2,3')).toBe(','));
  it('detecta ponto e vírgula', () => expect(detectDelim('a;b;c\n1;2;3')).toBe(';'));
  it('empate ou nada encontrado cai pra vírgula', () => expect(detectDelim('sozinho')).toBe(','));
  it('ignora separador dentro de aspas ao contar', () => expect(detectDelim('"a;b";c;d\n1;2;3')).toBe(';'));
});

describe('parseCSV', () => {
  it('separa campos simples', () => expect(parseCSV('a,b,c', ',')).toEqual([['a', 'b', 'c']]));
  it('respeita ; como separador', () => expect(parseCSV('a;b;c', ';')).toEqual([['a', 'b', 'c']]));
  it('aspas com separador dentro', () => expect(parseCSV('a;"b;c"', ';')).toEqual([['a', 'b;c']]));
  it('aspas escapadas (dupla aspa)', () => expect(parseCSV('a,"ele disse ""oi""",c', ',')).toEqual([['a', 'ele disse "oi"', 'c']]));
  it('quebra de linha dentro de aspas', () => expect(parseCSV('a,"linha1\nlinha2"', ',')).toEqual([['a', 'linha1\nlinha2']]));
  it('CRLF vira LF puro, sem \\r sobrando', () => expect(parseCSV('a,b\r\nc,d', ',')).toEqual([['a', 'b'], ['c', 'd']]));
  it('remove BOM do início', () => expect(parseCSV('﻿a,b', ',')).toEqual([['a', 'b']]));
  it('detecta separador sozinho quando não informado', () => expect(parseCSV('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]));
  it('preenche linhas curtas até a largura máxima (tabela sempre retangular)', () =>
    expect(parseCSV('a,b,c\nx,y', ',')).toEqual([
      ['a', 'b', 'c'],
      ['x', 'y', ''],
    ]));
  it('remove linhas finais totalmente vazias', () => expect(parseCSV('a,b\n\n\n', ',')).toEqual([['a', 'b']]));
});

describe('toCSV', () => {
  it('junta com o separador pedido', () =>
    expect(
      toCSV(
        [
          ['a', 'b'],
          ['1', '2'],
        ],
        ','
      )
    ).toBe('a,b\n1,2'));
  it('usa ; quando pedido', () =>
    expect(
      toCSV(
        [
          ['a', 'b'],
          ['1', '2'],
        ],
        ';'
      )
    ).toBe('a;b\n1;2'));
  it('coloca entre aspas um valor que contém o separador', () => expect(toCSV([['a,b', 'c']], ',')).toBe('"a,b",c'));
  it('escapa aspas duplicando', () => expect(toCSV([['ele disse "oi"']], ',')).toBe('"ele disse ""oi"""'));
  it('coloca entre aspas valor com quebra de linha', () => expect(toCSV([['linha1\nlinha2']], ',')).toBe('"linha1\nlinha2"'));
  it('não usa aspas quando não é necessário', () => expect(toCSV([['simples']], ',')).toBe('simples'));
});

describe('round-trip parse -> toCSV -> parse', () => {
  it('sobrevive intacto pra conteúdo com aspas, separador misto e acentuação', () => {
    const original = 'nome,qtd,obs\n"Vela, de ignição",260,"não tem ""defeito"" nenhum"\nCorrente,37,ok';
    const rows = parseCSV(original, ',');
    const back = toCSV(rows, ',');
    expect(parseCSV(back, ',')).toEqual(rows);
  });
});
