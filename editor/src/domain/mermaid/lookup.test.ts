import { describe, expect, it } from 'vitest';
import { colunaDe } from './lookup';
import { addColumn, addTable } from '../mutations/er';
import { blankER } from './factory';

describe('colunaDe', () => {
  it('resolve "TABELA#i" pro par tabela/coluna', () => {
    let d = addTable(blankER('t'), 'PEDIDO');
    d = addColumn(d, 'PEDIDO', { type: 'uuid', name: 'id', keys: ['PK'], note: '' });
    const r = colunaDe(d, 'PEDIDO#0');
    expect(r?.col.name).toBe('id');
    expect(r?.tab.id).toBe('PEDIDO');
  });

  it('devolve null pra índice fora do intervalo ou tabela inexistente', () => {
    const d = addTable(blankER('t'), 'PEDIDO');
    expect(colunaDe(d, 'PEDIDO#0')).toBeNull();
    expect(colunaDe(d, 'INEXISTENTE#0')).toBeNull();
  });
});
