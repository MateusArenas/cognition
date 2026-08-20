import type { Knex } from 'knex';
import type { ColumnMeta, DialectStrategy, ForeignKeyMeta, IndexMeta, TableRef } from './dialect.types';

interface Row {
  [key: string]: unknown;
}

// SQL Server via `sys.*` (mais confiável entre versões que `information_schema` pra PK/FK
// exatas). Sem servidor MSSQL disponível pra testar ao vivo neste ambiente — ver nota em
// pg.strategy.ts.
export class MssqlStrategy implements DialectStrategy {
  readonly family = 'mssql' as const;
  readonly clients = ['mssql', 'tedious'];

  defaultSchema(): string {
    return 'dbo';
  }

  async listSchemas(knex: Knex): Promise<string[]> {
    const rows = (await knex.raw(`select name from sys.schemas order by name`)) as unknown as Row[];
    return rows.map((r) => String(r.name));
  }

  async listDatabases(knex: Knex): Promise<string[]> {
    const rows = (await knex.raw(`select name from sys.databases where database_id > 4 order by name`)) as unknown as Row[];
    return rows.map((r) => String(r.name));
  }

  async listTables(knex: Knex, schema: string): Promise<TableRef[]> {
    const rows = (await knex.raw(
      `select t.name as name, 'table' as type, p.rows as row_estimate
       from sys.tables t
       join sys.schemas s on s.schema_id = t.schema_id
       left join sys.partitions p on p.object_id = t.object_id and p.index_id in (0,1)
       where s.name = ?
       union all
       select v.name as name, 'view' as type, null as row_estimate
       from sys.views v join sys.schemas s on s.schema_id = v.schema_id
       where s.name = ?
       order by name`,
      [schema, schema]
    )) as unknown as Row[];
    return rows.map((r) => ({
      name: String(r.name),
      schema,
      type: r.type === 'view' ? 'view' : 'table',
      rowCount: r.row_estimate != null ? Number(r.row_estimate) : undefined,
    }));
  }

  async columns(knex: Knex, table: string, schema: string): Promise<ColumnMeta[]> {
    const rows = (await knex.raw(
      `select c.name as name, ty.name as type, c.is_nullable as nullable, dc.definition as def,
              case when pk.column_id is not null then 1 else 0 end as is_pk, c.is_identity as is_auto
       from sys.columns c
       join sys.tables t on t.object_id = c.object_id
       join sys.schemas s on s.schema_id = t.schema_id
       join sys.types ty on ty.user_type_id = c.user_type_id
       left join sys.default_constraints dc on dc.object_id = c.default_object_id
       left join (
         select ic.object_id, ic.column_id from sys.index_columns ic
         join sys.indexes i on i.object_id = ic.object_id and i.index_id = ic.index_id
         where i.is_primary_key = 1
       ) pk on pk.object_id = c.object_id and pk.column_id = c.column_id
       where s.name = ? and t.name = ?
       order by c.column_id`,
      [schema, table]
    )) as unknown as Row[];
    return rows.map((r) => ({
      name: String(r.name),
      type: String(r.type),
      nullable: !!r.nullable,
      default: r.def as string | null,
      isPrimaryKey: !!r.is_pk,
      isAutoIncrement: !!r.is_auto,
    }));
  }

  async indexes(knex: Knex, table: string, schema: string): Promise<IndexMeta[]> {
    const rows = (await knex.raw(
      `select i.name as name, i.is_unique as [unique], i.is_primary_key as [primary], col.name as col_name
       from sys.indexes i
       join sys.tables t on t.object_id = i.object_id
       join sys.schemas s on s.schema_id = t.schema_id
       join sys.index_columns ic on ic.object_id = i.object_id and ic.index_id = i.index_id
       join sys.columns col on col.object_id = ic.object_id and col.column_id = ic.column_id
       where s.name = ? and t.name = ? and i.name is not null
       order by i.name, ic.key_ordinal`,
      [schema, table]
    )) as unknown as Row[];
    const byName = new Map<string, IndexMeta>();
    for (const r of rows) {
      const name = String(r.name);
      const existing = byName.get(name);
      if (existing) existing.columns.push(String(r.col_name));
      else byName.set(name, { name, columns: [String(r.col_name)], unique: !!r.unique, primary: !!r.primary });
    }
    return [...byName.values()];
  }

  async foreignKeys(knex: Knex, schema: string): Promise<ForeignKeyMeta[]> {
    const rows = (await knex.raw(
      `select fk.name as name, tp.name as table_name, cp.name as column_name, tr.name as ref_table, cr.name as ref_column
       from sys.foreign_keys fk
       join sys.foreign_key_columns fkc on fkc.constraint_object_id = fk.object_id
       join sys.tables tp on tp.object_id = fkc.parent_object_id
       join sys.columns cp on cp.object_id = fkc.parent_object_id and cp.column_id = fkc.parent_column_id
       join sys.tables tr on tr.object_id = fkc.referenced_object_id
       join sys.columns cr on cr.object_id = fkc.referenced_object_id and cr.column_id = fkc.referenced_column_id
       join sys.schemas s on s.schema_id = tp.schema_id
       where s.name = ?
       order by fk.name, fkc.constraint_column_id`,
      [schema]
    )) as unknown as Row[];
    const byName = new Map<string, ForeignKeyMeta>();
    for (const r of rows) {
      const name = String(r.name);
      const existing = byName.get(name);
      if (existing) {
        existing.columns.push(String(r.column_name));
        existing.refColumns.push(String(r.ref_column));
      } else {
        byName.set(name, {
          name,
          table: String(r.table_name),
          columns: [String(r.column_name)],
          refTable: String(r.ref_table),
          refColumns: [String(r.ref_column)],
        });
      }
    }
    return [...byName.values()];
  }

  // Sem SHOW CREATE TABLE no MSSQL — reconstruído a partir de columns()/indexes(), mesma
  // estratégia de pg.strategy.ts.
  async ddl(knex: Knex, table: string, schema: string): Promise<string> {
    const [cols, idx] = await Promise.all([this.columns(knex, table, schema), this.indexes(knex, table, schema)]);
    const lines = cols.map((c) => `  [${c.name}] ${c.type}${c.nullable ? '' : ' NOT NULL'}${c.default ? ` DEFAULT ${c.default}` : ''}`);
    const pk = cols.filter((c) => c.isPrimaryKey).map((c) => `[${c.name}]`);
    if (pk.length) lines.push(`  PRIMARY KEY (${pk.join(', ')})`);
    const body = `CREATE TABLE [${schema}].[${table}] (\n${lines.join(',\n')}\n);`;
    const indexSql = idx
      .filter((i) => !i.primary)
      .map((i) => `CREATE ${i.unique ? 'UNIQUE ' : ''}INDEX [${i.name}] ON [${schema}].[${table}] (${i.columns.map((c) => `[${c}]`).join(', ')});`)
      .join('\n');
    return indexSql ? `${body}\n\n${indexSql}` : body;
  }
}
