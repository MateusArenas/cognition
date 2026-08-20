import type { Knex } from 'knex';
import type { ColumnMeta, DialectStrategy, ForeignKeyMeta, IndexMeta, TableRef } from './dialect.types';

interface Row {
  [key: string]: unknown;
}

// Oracle via `ALL_*` (funciona pro schema do próprio usuário e pros que ele tem GRANT — mais
// portável que `USER_*`/`DBA_*`). `oracledb` é pesado e não vem instalado por padrão
// (DB-MOBILE.md §4.1) — esta estratégia existe pro catálogo/registro ficar completo, mas
// `GET /drivers` vai reportar o pacote como não instalado até alguém rodar `npm i oracledb`.
// Sem teste ao vivo neste ambiente, mesma nota das outras estratégias além de sqlite.
export class OracleStrategy implements DialectStrategy {
  readonly family = 'oracle' as const;
  readonly clients = ['oracledb'];

  defaultSchema(): string {
    return '';
  }

  async listSchemas(knex: Knex): Promise<string[]> {
    const rows = (await knex.raw(`select username as name from all_users order by username`)) as unknown as Row[];
    return rows.map((r) => String(r.name));
  }

  async listDatabases(): Promise<string[]> {
    return []; // Oracle não tem o conceito de "múltiplos bancos" como pg/mysql — é schema.
  }

  async listTables(knex: Knex, schema: string): Promise<TableRef[]> {
    const rows = (await knex.raw(
      `select table_name as name, 'table' as type, num_rows as row_estimate from all_tables where owner = ?
       union all
       select view_name as name, 'view' as type, null as row_estimate from all_views where owner = ?
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
      `select c.column_name as name, c.data_type as type, c.nullable = 'Y' as nullable, c.data_default as def,
              case when pk.column_name is not null then 1 else 0 end as is_pk,
              case when c.identity_column = 'YES' then 1 else 0 end as is_auto
       from all_tab_columns c
       left join (
         select cc.column_name, cc.table_name, cc.owner
         from all_constraints k
         join all_cons_columns cc on cc.constraint_name = k.constraint_name and cc.owner = k.owner
         where k.constraint_type = 'P'
       ) pk on pk.table_name = c.table_name and pk.owner = c.owner and pk.column_name = c.column_name
       where c.owner = ? and c.table_name = ?
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
      `select i.index_name as name, i.uniqueness = 'UNIQUE' as unique_flag,
              case when p.constraint_type = 'P' then 1 else 0 end as is_primary, ic.column_name as col_name
       from all_indexes i
       join all_ind_columns ic on ic.index_name = i.index_name and ic.index_owner = i.owner
       left join all_constraints p on p.index_name = i.index_name and p.owner = i.owner and p.constraint_type = 'P'
       where i.owner = ? and i.table_name = ?
       order by i.index_name, ic.column_position`,
      [schema, table]
    )) as unknown as Row[];
    const byName = new Map<string, IndexMeta>();
    for (const r of rows) {
      const name = String(r.name);
      const existing = byName.get(name);
      if (existing) existing.columns.push(String(r.col_name));
      else byName.set(name, { name, columns: [String(r.col_name)], unique: !!r.unique_flag, primary: !!r.is_primary });
    }
    return [...byName.values()];
  }

  async foreignKeys(knex: Knex, schema: string): Promise<ForeignKeyMeta[]> {
    const rows = (await knex.raw(
      `select a.constraint_name as name, a.table_name as table_name, a.column_name as column_name,
              r_cols.table_name as ref_table, r_cols.column_name as ref_column
       from all_cons_columns a
       join all_constraints c on c.constraint_name = a.constraint_name and c.owner = a.owner
       join all_cons_columns r_cols on r_cols.constraint_name = c.r_constraint_name and r_cols.position = a.position
       where c.constraint_type = 'R' and a.owner = ?
       order by a.constraint_name, a.position`,
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

  async ddl(knex: Knex, table: string, schema: string): Promise<string> {
    const [cols, idx] = await Promise.all([this.columns(knex, table, schema), this.indexes(knex, table, schema)]);
    const lines = cols.map((c) => `  "${c.name}" ${c.type}${c.nullable ? '' : ' NOT NULL'}`);
    const pk = cols.filter((c) => c.isPrimaryKey).map((c) => `"${c.name}"`);
    if (pk.length) lines.push(`  PRIMARY KEY (${pk.join(', ')})`);
    const body = `CREATE TABLE "${schema}"."${table}" (\n${lines.join(',\n')}\n);`;
    const indexSql = idx
      .filter((i) => !i.primary)
      .map((i) => `CREATE ${i.unique ? 'UNIQUE ' : ''}INDEX "${i.name}" ON "${schema}"."${table}" (${i.columns.map((c) => `"${c}"`).join(', ')});`)
      .join('\n');
    return indexSql ? `${body}\n\n${indexSql}` : body;
  }
}
