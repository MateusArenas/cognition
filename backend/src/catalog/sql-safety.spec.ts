import { checkReadOnlySql } from './sql-safety';

describe('checkReadOnlySql', () => {
  it('aceita um SELECT simples e detecta a tabela de origem (sem JOIN)', () => {
    const r = checkReadOnlySql('select * from customers where id = 1');
    expect(r.ok).toBe(true);
    expect(r.hasJoin).toBe(false);
    expect(r.table).toBe('customers');
  });

  it('aceita WITH (CTE) como instrução de leitura', () => {
    const r = checkReadOnlySql('with recent as (select * from orders) select * from recent');
    expect(r.ok).toBe(true);
  });

  it('detecta JOIN e não extrai uma única tabela editável', () => {
    const r = checkReadOnlySql('select * from orders o join customers c on c.id = o.customer_id');
    expect(r.ok).toBe(true);
    expect(r.hasJoin).toBe(true);
    expect(r.table).toBeUndefined();
  });

  it('rejeita consulta vazia', () => {
    expect(checkReadOnlySql('   ').ok).toBe(false);
  });

  it('rejeita qualquer coisa que não comece com SELECT/WITH', () => {
    const r = checkReadOnlySql('update customers set name = ?');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/SELECT/);
  });

  it('rejeita DELETE/DROP/etc mesmo escondido dentro de uma CTE gravável', () => {
    const r = checkReadOnlySql("with t as (delete from customers returning *) select * from t");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/DELETE/i);
  });

  it('rejeita múltiplas instruções separadas por ponto e vírgula', () => {
    const r = checkReadOnlySql('select 1; select 2');
    expect(r.ok).toBe(false);
  });

  it('aceita um único ; final (comum ao colar SQL de outro lugar)', () => {
    const r = checkReadOnlySql('select * from customers;');
    expect(r.ok).toBe(true);
    expect(r.table).toBe('customers');
  });

  it('rejeita DROP TABLE mesmo sem JOIN nem segunda instrução', () => {
    const r = checkReadOnlySql('drop table customers');
    expect(r.ok).toBe(false);
  });
});
