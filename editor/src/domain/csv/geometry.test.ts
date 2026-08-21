import { describe, expect, it } from 'vitest';
import { colAt, colOffsets, rowAt, ROW_H } from './geometry';

describe('colOffsets', () => {
  it('acumula as larguras', () => expect(colOffsets([100, 50, 80])).toEqual([0, 100, 150, 230]));
  it('vazio devolve só o zero inicial', () => expect(colOffsets([])).toEqual([0]));
});

describe('colAt', () => {
  const offsets = colOffsets([100, 50, 80]); // [0, 100, 150, 230]
  it('início exato de uma coluna', () => {
    expect(colAt(0, offsets)).toBe(0);
    expect(colAt(100, offsets)).toBe(1);
    expect(colAt(150, offsets)).toBe(2);
  });
  it('meio de uma coluna', () => {
    expect(colAt(50, offsets)).toBe(0);
    expect(colAt(120, offsets)).toBe(1);
  });
  it('x negativo trava na primeira coluna', () => expect(colAt(-50, offsets)).toBe(0));
  it('x além do fim trava na última coluna', () => expect(colAt(9999, offsets)).toBe(2));
  it('sem colunas (só offset [0]) sempre devolve 0', () => expect(colAt(50, [0])).toBe(0));
});

describe('rowAt', () => {
  it('linha 0 no topo', () => expect(rowAt(0)).toBe(0));
  it('meio da linha 1', () => expect(rowAt(ROW_H + 5)).toBe(1));
  it('y negativo trava em 0', () => expect(rowAt(-10)).toBe(0));
  it('aceita altura de linha customizada', () => expect(rowAt(90, 44)).toBe(2));
});
