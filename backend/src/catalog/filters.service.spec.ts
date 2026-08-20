import { BadRequestException } from '@nestjs/common';
import type { Knex } from 'knex';
import { FiltersService } from './filters.service';
import type { ColumnMeta } from './dialects/dialect.types';

// Fake mínimo de QueryBuilder — só grava quais métodos foram chamados com quais argumentos,
// suficiente pra provar que FiltersService nunca concatena string nenhuma: todo identificador
// vai por `??`, todo valor por bind. Não precisa de banco de verdade — esta é a peça de lógica
// pura por trás da "REGRA DE PROJETO" do DB-MOBILE.md.
function fakeQuery() {
  const calls: { method: string; args: unknown[] }[] = [];
  const q: Record<string, unknown> = {};
  for (const method of ['where', 'whereNot', 'whereRaw', 'whereIn', 'whereBetween', 'whereNull', 'whereNotNull', 'orWhereRaw']) {
    q[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return q;
    };
  }
  return { q: q as unknown as Knex.QueryBuilder, calls };
}

describe('FiltersService', () => {
  const service = new FiltersService();
  const validColumns = new Set(['id', 'status', 'email']);

  describe('assertColumn', () => {
    it('aceita coluna que existe no catálogo', () => {
      expect(service.assertColumn('status', validColumns)).toBe('status');
    });

    it('rejeita coluna fora do catálogo — mesmo parecendo um comando SQL', () => {
      expect(() => service.assertColumn('id; drop table orders; --', validColumns)).toThrow(BadRequestException);
    });
  });

  describe('parseFilters', () => {
    it('undefined vira lista vazia', () => {
      expect(service.parseFilters(undefined)).toEqual([]);
    });

    it('rejeita JSON malformado', () => {
      expect(() => service.parseFilters('{not json')).toThrow(BadRequestException);
    });

    it('rejeita algo que não é um array', () => {
      expect(() => service.parseFilters('{"a":1}')).toThrow(BadRequestException);
    });

    it('aceita um array válido', () => {
      expect(service.parseFilters('[{"column":"status","op":"eq","value":"open"}]')).toHaveLength(1);
    });
  });

  describe('applyFilters', () => {
    it('eq usa where() com bind, não concatenação', () => {
      const { q, calls } = fakeQuery();
      service.applyFilters(q, [{ column: 'status', op: 'eq', value: 'open' }], validColumns);
      expect(calls).toEqual([{ method: 'where', args: ['status', 'open'] }]);
    });

    it('contains usa whereRaw com ?? pro identificador e ? pro valor — nunca concatenado na string SQL', () => {
      const { q, calls } = fakeQuery();
      service.applyFilters(q, [{ column: 'email', op: 'contains', value: 'Ana' }], validColumns);
      expect(calls[0].method).toBe('whereRaw');
      const [sql, bindings] = calls[0].args as [string, unknown[]];
      expect(sql).toContain('??');
      expect(sql).not.toContain('Ana'); // o valor nunca entra na string SQL, só no binding
      expect(bindings).toEqual(['email', '%ana%']);
    });

    it('barra filtro numa coluna que não existe antes de tocar no query builder', () => {
      const { q, calls } = fakeQuery();
      expect(() => service.applyFilters(q, [{ column: 'senha_do_admin', op: 'eq', value: 1 }], validColumns)).toThrow(BadRequestException);
      expect(calls).toHaveLength(0);
    });

    it('in / between / isNull / notNull chamam o método certo do builder', () => {
      const { q, calls } = fakeQuery();
      service.applyFilters(
        q,
        [
          { column: 'id', op: 'in', value: [1, 2, 3] },
          { column: 'id', op: 'between', value: [1, 10] },
          { column: 'status', op: 'isNull' },
          { column: 'status', op: 'notNull' },
        ],
        validColumns
      );
      expect(calls.map((c) => c.method)).toEqual(['whereIn', 'whereBetween', 'whereNull', 'whereNotNull']);
    });
  });

  describe('applySearch', () => {
    const columns: ColumnMeta[] = [
      { name: 'id', type: 'integer', nullable: false, isPrimaryKey: true, isAutoIncrement: true },
      { name: 'email', type: 'varchar', nullable: false, isPrimaryKey: false, isAutoIncrement: false },
    ];

    it('qMode "texto" só busca em colunas textuais', () => {
      const { q, calls } = fakeQuery();
      const n = service.applySearch(q, 'ana', columns, 'pg', 'texto');
      expect(n).toBe(1); // só "email" é textual
      expect(calls[0].method).toBe('where');
    });

    it('sem termo de busca não toca no builder', () => {
      const { q, calls } = fakeQuery();
      const n = service.applySearch(q, '   ', columns, 'pg', 'tudo');
      expect(n).toBe(0);
      expect(calls).toHaveLength(0);
    });

    it('usa o tipo de cast certo por família (mysql = CHAR, pg/sqlite = text)', () => {
      function castTypeUsed(family: Parameters<typeof service.applySearch>[3]): string {
        let sql = '';
        const q = { where: (fn: (b: Knex.QueryBuilder) => void) => fn({ orWhereRaw: (s: string) => (sql = s) } as unknown as Knex.QueryBuilder) };
        service.applySearch(q as unknown as Knex.QueryBuilder, 'x', columns, family);
        return sql;
      }
      expect(castTypeUsed('mysql')).toContain('char');
      expect(castTypeUsed('pg')).toContain('text');
      expect(castTypeUsed('sqlite')).toContain('text');
    });
  });
});
