import { describe, expect, it } from 'vitest';
import { colIndex, colName, evalFormula, evaluateSheet, fmtNum, numval, parseRef, shiftFormula } from './formula';

const GRID = [
  [1, 2, 3],
  [10, 20, 30],
];
const get = (r: number, c: number) => GRID[r][c];

describe('evalFormula — aritmética e comparação', () => {
  it('soma simples', () => expect(evalFormula('1+2', get)).toBe(3));
  it('precedência: mul antes de add', () => expect(evalFormula('2+3*4', get)).toBe(14));
  it('parênteses', () => expect(evalFormula('(2+3)*4', get)).toBe(20));
  it('potência', () => expect(evalFormula('2^3', get)).toBe(8));
  it('unário negativo', () => expect(evalFormula('-5+2', get)).toBe(-3));
  it('divisão por zero é erro', () => expect(() => evalFormula('1/0', get)).toThrow('#DIV/0!'));
  it('comparação numérica', () => expect(evalFormula('5>3', get)).toBe(true));
  it('concatenação com &', () => expect(evalFormula('"a"&"b"', get)).toBe('ab'));
});

describe('evalFormula — referências e intervalos', () => {
  it('referência de célula', () => expect(evalFormula('A1', get)).toBe(1));
  it('referência em expressão', () => expect(evalFormula('A1+B2', get)).toBe(21));
  it('intervalo dentro de SOMA', () => expect(evalFormula('SOMA(A1:C1)', get)).toBe(6));
  it('intervalo 2D', () => expect(evalFormula('SOMA(A1:C2)', get)).toBe(66));
  it('referência fora da tabela resolve pro que get() devolver (undefined tratado como 0 em SOMA)', () =>
    expect(evalFormula('SOMA(A99)', () => undefined)).toBe(0));
  it('nome de função inexistente', () => expect(() => evalFormula('NAOEXISTE(1)', get)).toThrow('#NOME?'));
  it('sintaxe quebrada', () => expect(() => evalFormula('1+', get)).toThrow('#SINTAXE'));
});

describe('evalFormula — funções, nomes PT e EN', () => {
  it('SOMA === SUM', () => {
    expect(evalFormula('SOMA(A1:C1)', get)).toBe(evalFormula('SUM(A1:C1)', get));
  });
  it('MÉDIA/MEDIA/AVERAGE', () => {
    expect(evalFormula('MÉDIA(A1:C1)', get)).toBe(2);
    expect(evalFormula('MEDIA(A1:C1)', get)).toBe(2);
    expect(evalFormula('AVERAGE(A1:C1)', get)).toBe(2);
  });
  it('MIN/MAX', () => {
    expect(evalFormula('MIN(A1:C2)', get)).toBe(1);
    expect(evalFormula('MAX(A1:C2)', get)).toBe(30);
  });
  it('CONT/COUNT conta itens do intervalo', () => expect(evalFormula('CONT(A1:C2)', get)).toBe(6));
  it('ARRED/ROUND com casas decimais', () => {
    const g = () => 3.14159;
    expect(evalFormula('ARRED(3.14159;2)', g)).toBeCloseTo(3.14, 5);
  });
  it('ABS/INT/RAIZ(SQRT)', () => {
    const g = () => -9;
    expect(evalFormula('ABS(-9)', g)).toBe(9);
    expect(evalFormula('INT(3.9)', g)).toBe(3);
    expect(evalFormula('RAIZ(9)', g)).toBe(3);
  });
  it('MULT/PRODUCT', () => expect(evalFormula('MULT(2;3;4)', get)).toBe(24));
  it('SE/IF condicional', () => {
    expect(evalFormula('SE(1>0;"sim";"não")', get)).toBe('sim');
    expect(evalFormula('IF(1<0;"sim";"não")', get)).toBe('não');
  });
});

describe('evalFormula — separador de argumento aceita , e ;', () => {
  it('vírgula', () => expect(evalFormula('SOMA(1,2,3)', get)).toBe(6));
  it('ponto e vírgula (hábito do Excel brasileiro)', () => expect(evalFormula('SOMA(1;2;3)', get)).toBe(6));
});

describe('evaluateSheet — cache e ciclo', () => {
  it('resolve fórmula simples', () => {
    const { shown } = evaluateSheet([['1', '2', '=A1+B1']]);
    expect(shown(0, 2)).toBe('3');
  });
  it('valor literal com vírgula decimal', () => {
    const { value } = evaluateSheet([['12,90']]);
    expect(value(0, 0)).toBe(12.9);
  });
  it('detecta referência circular direta', () => {
    const { shown } = evaluateSheet([['=A1']]);
    expect(shown(0, 0)).toBe('#CICLO');
  });
  it('detecta referência circular indireta (A1->B1->A1)', () => {
    const { shown } = evaluateSheet([['=B1', '=A1']]);
    expect(shown(0, 0)).toBe('#CICLO');
  });
  it('erro de fórmula vira string de erro na célula, não lança', () => {
    const { shown } = evaluateSheet([['=1/0']]);
    expect(shown(0, 0)).toBe('#DIV/0!');
  });
  it('duas linhas dependentes calculam em cascata', () => {
    const { shown } = evaluateSheet([
      ['2', '3', '=A1*B1'],
      ['', '', '=SOMA(C1:C1)'],
    ]);
    expect(shown(0, 2)).toBe('6');
    expect(shown(1, 2)).toBe('6');
  });
});

describe('numval', () => {
  it('número puro', () => expect(numval('42')).toBe(42));
  it('vírgula decimal', () => expect(numval('12,90')).toBe(12.9));
  it('milhar com ponto + vírgula decimal', () => expect(numval('1.234,56')).toBe(1234.56));
  it('prefixo R$', () => expect(numval('R$ 10,50')).toBe(10.5));
  it('sufixo %', () => expect(numval('50%')).toBe(50));
  it('texto não numérico é null', () => expect(numval('abc')).toBeNull());
  it('vazio é null', () => expect(numval('')).toBeNull());
  it('null/undefined é null', () => {
    expect(numval(null)).toBeNull();
    expect(numval(undefined)).toBeNull();
  });
});

describe('fmtNum', () => {
  it('formata em pt-BR', () => expect(fmtNum(1234.5)).toBe('1.234,5'));
  it('NaN vira #NÚM!', () => expect(fmtNum(NaN)).toBe('#NÚM!'));
  it('infinito vira #DIV/0!', () => expect(fmtNum(Infinity)).toBe('#DIV/0!'));
});

describe('colName / colIndex', () => {
  it('primeiras colunas', () => {
    expect(colName(0)).toBe('A');
    expect(colName(25)).toBe('Z');
    expect(colName(26)).toBe('AA');
    expect(colName(701)).toBe('ZZ');
  });
  it('colIndex é o inverso de colName', () => {
    for (const i of [0, 1, 25, 26, 27, 51, 52, 701]) expect(colIndex(colName(i))).toBe(i);
  });
});

describe('parseRef', () => {
  it('resolve linha/coluna', () => expect(parseRef('B3')).toEqual({ c: 1, r: 2 }));
  it('referência inválida lança #REF!', () => expect(() => parseRef('123')).toThrow('#REF!'));
});

describe('shiftFormula', () => {
  it('desloca referência de linha em fórmula', () => expect(shiftFormula('=A1+B1', 2)).toBe('=A3+B3'));
  it('não mexe em valor literal', () => expect(shiftFormula('12,90', 2)).toBe('12,90'));
  it('desloca múltiplas referências', () => expect(shiftFormula('=SOMA(A1:A9)', 1)).toBe('=SOMA(A2:A10)'));
});
