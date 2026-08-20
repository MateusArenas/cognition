import type { Knex } from 'knex';
import type { ColumnMeta, DialectStrategy, ForeignKeyMeta, IndexMeta, TableRef } from './dialect.types';

// MySQL/MariaDB via `information_schema` (padrão, funciona nos dois) e `SHOW CREATE TABLE` pro
// DDL (o próprio motor devolve o texto certo — não precisa reconstruir como no Postgres).
// Mesma observação de pg.strategy.ts: código completo, sem servidor MySQL disponível pra
// testar ao vivo neste ambiente.
export class MysqlStrategy implements DialectStrategy {
  readonly family = 'mysql' as const;
  readonly clients = ['mysql2'];

  defaultSchema(): string {
    return '';
  }

  async listSchemas(knex: Knex): Promise<string[]> {
    const rows = (await knex.raw(
      `select schema_name as name from information_schema.schemata
       where schema_name not in ('information_schema','performance_schema','mysql','sys')
       order by 1`
    )) as unknown as [{ name: string }[]];
    return rows[0].map((r) => r.name);
  }

  async listDatabases(knex: Knex): Promise<string[]> {
    return this.listSchemas(knex);
  }

  async listTables(knex: Knex, schema: string): Promise<TableRef[]> {
    const rows = (await knex.raw(
      `select table_name as name, table_type as type, table_rows as row_estimate,
              (data_length + index_length) as size_bytes
       from information_schema.tables where table_schema = ? order by table_name`,
      [schema]
    )) as unknown as [{ name: string; type: string; row_estimate: number | null; size_bytes: number | null }[]];
    return rows[0].map((r) => ({
      name: r.name,
      schema,
      type: r.type === 'VIEW' ? 'view' : 'table',
      rowCount: r.row_estimate ?? undefined,
      sizeBytes: r.size_bytes ?? undefined,
    }));
  }

  async columns(knex: Knex, table: string, schema: string): Promise<ColumnMeta[]> {
    const rows = (await knex.raw(
      `select column_name as name, column_type as type, is_nullable = 'YES' as nullable,
              column_default as \`default\`, column_key = 'PRI' as is_pk,
              extra like '%auto_increment%' as is_auto
       from information_schema.columns
       where table_schema = ? and table_name = ?
       order by ordinal_position`,
      [schema, table]
    )) as unknown as [
      { name: string; type: string; nullable: number; default: string | null; is_pk: number; is_auto: number }[],
    ];
    return rows[0].map((r) => ({
      name: r.name,
      type: r.type,
      nullable: !!r.nullable,
      default: r.default,
      isPrimaryKey: !!r.is_pk,
      isAutoIncrement: !!r.is_auto,
    }));
  }

  async indexes(knex: Knex, table: string, schema: string): Promise<IndexMeta[]> {
    const rows = (await knex.raw(
      `select index_name as name, non_unique = 0 as \`unique\`, index_name = 'PRIMARY' as \`primary\`,
              group_concat(column_name order by seq_in_index) as columns_csv
       from information_schema.statistics
       where table_schema = ? and table_name = ?
       group by index_name, non_unique`,
      [schema, table]
    )) as unknown as [{ name: string; unique: number; primary: number; columns_csv: string }[]];
    return rows[0].map((r) => ({
      name: r.name,
      columns: r.columns_csv.split(','),
      unique: !!r.unique,
      primary: !!r.primary,
    }));
  }

  async foreignKeys(knex: Knex, schema: string): Promise<ForeignKeyMeta[]> {
    const rows = (await knex.raw(
      `select constraint_name as name, table_name, column_name, referenced_table_name as ref_table,
              referenced_column_name as ref_column
       from information_schema.key_column_usage
       where table_schema = ? and referenced_table_name is not null
       order by constraint_name, ordinal_position`,
      [schema]
    )) as unknown as [{ name: string; table_name: string; column_name: string; ref_table: string; ref_column: string }[]];

    const byName = new Map<string, ForeignKeyMeta>();
    for (const r of rows[0]) {
      const existing = byName.get(r.name);
      if (existing) {
        existing.columns.push(r.column_name);
        existing.refColumns.push(r.ref_column);
      } else {
        byName.set(r.name, { name: r.name, table: r.table_name, columns: [r.column_name], refTable: r.ref_table, refColumns: [r.ref_column] });
      }
    }
    return [...byName.values()];
  }

  async ddl(knex: Knex, table: string): Promise<string> {
    const rows = (await knex.raw('SHOW CREATE TABLE ??', [table])) as unknown as [{ 'Create Table'?: string; 'Create View'?: string }[]];
    const row = rows[0]?.[0];
    return row?.['Create Table'] ?? row?.['Create View'] ?? '';
  }
}
