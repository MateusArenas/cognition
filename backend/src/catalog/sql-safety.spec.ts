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

  describe('com allowWrite: true', () => {
    it('aceita UPDATE e extrai a tabela', () => {
      const r = checkReadOnlySql('update customers set name = ? where id = 1', { allowWrite: true });
      expect(r.ok).toBe(true);
      expect(r.isWrite).toBe(true);
      expect(r.table).toBe('customers');
    });

    it('aceita DELETE FROM e extrai a tabela', () => {
      const r = checkReadOnlySql('delete from orders where id = 1', { allowWrite: true });
      expect(r.ok).toBe(true);
      expect(r.isWrite).toBe(true);
      expect(r.table).toBe('orders');
    });

    it('aceita INSERT INTO e extrai a tabela', () => {
      const r = checkReadOnlySql("insert into customers (name) values ('a')", { allowWrite: true });
      expect(r.ok).toBe(true);
      expect(r.isWrite).toBe(true);
      expect(r.table).toBe('customers');
    });

    it('continua rejeitando DROP/ALTER/TRUNCATE mesmo com allowWrite', () => {
      expect(checkReadOnlySql('drop table customers', { allowWrite: true }).ok).toBe(false);
      expect(checkReadOnlySql('alter table customers add column x text', { allowWrite: true }).ok).toBe(false);
      expect(checkReadOnlySql('truncate table customers', { allowWrite: true }).ok).toBe(false);
    });

    it('continua rejeitando múltiplas instruções mesmo com allowWrite', () => {
      const r = checkReadOnlySql('update customers set name = ?; select 1', { allowWrite: true });
      expect(r.ok).toBe(false);
    });

    it('SELECT continua funcionando normalmente com allowWrite ligado', () => {
      const r = checkReadOnlySql('select * from customers', { allowWrite: true });
      expect(r.ok).toBe(true);
      expect(r.isWrite).toBeFalsy();
    });
  });

  it('sem allowWrite, UPDATE/DELETE/INSERT continuam rejeitados (comportamento padrão inalterado)', () => {
    expect(checkReadOnlySql('update customers set name = ?').ok).toBe(false);
    expect(checkReadOnlySql('delete from customers').ok).toBe(false);
    expect(checkReadOnlySql("insert into customers (name) values ('a')").ok).toBe(false);
  });
});
