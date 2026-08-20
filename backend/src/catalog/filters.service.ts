import { BadRequestException, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import type { Family } from './dialects/dialect.types';
import type { ColumnMeta } from './dialects/dialect.types';
import type { FilterInput, FilterOp } from './dto/rows-query.dto';

const CAST_TEXT: Record<Family, string> = {
  pg: 'text',
  sqlite: 'text',
  mysql: 'char',
  mssql: 'varchar(4000)',
  oracle: 'varchar2(4000)',
};

// O coração da "REGRA DE PROJETO" do DB-MOBILE.md: nada que o usuário digita vira SQL. Toda
// coluna passa por assertColumn() contra o catálogo REAL (nunca aceita um nome que a
// introspecção não devolveu); todo valor vai por bind (`?`), todo identificador por `??` —
// nunca concatenação de string.
@Injectable()
export class FiltersService {
  assertColumn(name: string, validColumns: ReadonlySet<string>): string {
    if (!validColumns.has(name)) {
      throw new BadRequestException({ message: `Coluna "${name}" não existe nesta tabela.`, code: 'UNKNOWN_COLUMN' });
    }
    return name;
  }

  parseFilters(raw: string | undefined): FilterInput[] {
    if (!raw) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException({ message: 'Parâmetro "filters" não é um JSON válido.', code: 'BAD_FILTERS' });
    }
    if (!Array.isArray(parsed)) throw new BadRequestException({ message: '"filters" precisa ser uma lista.', code: 'BAD_FILTERS' });
    return parsed as FilterInput[];
  }

  applyFilters(query: Knex.QueryBuilder, filters: FilterInput[], validColumns: ReadonlySet<string>): void {
    for (const f of filters) {
      const column = this.assertColumn(f.column, validColumns);
      this.applyOne(query, column, f.op, f.value);
    }
  }

  private applyOne(query: Knex.QueryBuilder, column: string, op: FilterOp, value: unknown): void {
    switch (op) {
      case 'eq':
        query.where(column, value as never);
        return;
      case 'neq':
        query.whereNot(column, value as never);
        return;
      case 'gt':
        query.where(column, '>', value as never);
        return;
      case 'gte':
        query.where(column, '>=', value as never);
        return;
      case 'lt':
        query.where(column, '<', value as never);
        return;
      case 'lte':
        query.where(column, '<=', value as never);
        return;
      case 'contains':
        query.whereRaw('LOWER(??) LIKE ?', [column, `%${String(value).toLowerCase()}%`]);
        return;
      case 'startsWith':
        query.whereRaw('LOWER(??) LIKE ?', [column, `${String(value).toLowerCase()}%`]);
        return;
      case 'endsWith':
        query.whereRaw('LOWER(??) LIKE ?', [column, `%${String(value).toLowerCase()}`]);
        return;
      case 'in':
        query.whereIn(column, (Array.isArray(value) ? value : [value]) as never[]);
        return;
      case 'between': {
        const [a, b] = value as [unknown, unknown];
        query.whereBetween(column, [a, b] as [never, never]);
        return;
      }
      case 'isNull':
        query.whereNull(column);
        return;
      case 'notNull':
        query.whereNotNull(column);
        return;
      default:
        throw new BadRequestException({ message: `Operador "${op}" desconhecido.`, code: 'BAD_FILTER_OP' });
    }
  }

  // Busca rápida (debounce de 350ms no app): agrupa um OR entre as colunas elegíveis — texto de
  // verdade em qMode='texto', todas (com cast) em qMode='tudo'. Devolve quantas colunas entraram
  // na busca (`colunasBuscadas` na resposta).
  applySearch(query: Knex.QueryBuilder, q: string, columns: ColumnMeta[], family: Family, qMode: 'tudo' | 'texto' = 'tudo'): number {
    const eligible = qMode === 'texto' ? columns.filter((c) => /char|text|clob|string/i.test(c.type)) : columns;
    if (!eligible.length || !q.trim()) return 0;
    const castType = CAST_TEXT[family];
    const needle = `%${q.toLowerCase()}%`;
    query.where((builder) => {
      for (const c of eligible) {
        builder.orWhereRaw(`LOWER(CAST(?? AS ${castType})) LIKE ?`, [c.name, needle]);
      }
    });
    return eligible.length;
  }
}
