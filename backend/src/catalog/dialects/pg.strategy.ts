import type { Knex } from 'knex';
import type { ColumnMeta, DialectStrategy, ForeignKeyMeta, IndexMeta, TableRef } from './dialect.types';

// PostgreSQL (também usado por CockroachDB/Redshift, que falam o mesmo catálogo em boa parte).
// Toda consulta aqui é SQL escrito pelo BACKEND — fixo, só recebe identificador vindo do
// catálogo (nunca do usuário) via bind (`?`), nunca concatenado — DB-MOBILE.md, "REGRA DE
// PROJETO: nada que vem do usuário vira SQL". `unnest`/`array_agg` são exatamente o caso que o
// query builder não alcança sozinho (§ tabela de knex.raw permitido).
//
// Sem servidor Postgres disponível no ambiente onde isto foi escrito — ver
// docs/17-db-client.md/CHECKLIST.md: código completo e revisado, mas sem teste de integração
// ao vivo (só SqliteStrategy tem isso nesta entrega).
export class PgStrategy implements DialectStrategy {
  readonly family = 'pg' as const;
  readonly clients = ['pg', 'pg-native', 'cockroachdb', 'redshift'];

  defaultSchema(): string {
    return 'public';
  }

  async listSchemas(knex: Knex): Promise<string[]> {
    const r = await knex.raw<{ rows: { schema_name: string }[] }>(
      `select schema_name from information_schema.schemata
       where schema_name not in ('pg_catalog','information_schema') and schema_name not like 'pg_toast%'
       order by 1`
    );
    return r.rows.map((x) => x.schema_name);
  }

  async listDatabases(knex: Knex): Promise<string[]> {
    const r = await knex.raw<{ rows: { datname: string }[] }>('select datname from pg_database where datistemplate = false order by 1');
    return r.rows.map((x) => x.datname);
  }

  async listTables(knex: Knex, schema: string): Promise<TableRef[]> {
    const r = await knex.raw<{
      rows: { name: string; kind: string; row_estimate: string | null; size_bytes: string | null }[];
    }>(
      `select c.relname as name, c.relkind as kind, c.reltuples::bigint as row_estimate,
              pg_total_relation_size(c.oid) as size_bytes
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = ? and c.relkind in ('r','v','p')
       order by c.relname`,
      [schema]
    );
    return r.rows.map((row) => ({
      name: row.name,
      schema,
      type: row.kind === 'v' ? 'view' : 'table',
      rowCount: row.row_estimate ? Number(row.row_estimate) : undefined,
      sizeBytes: row.size_bytes ? Number(row.size_bytes) : undefined,
    }));
  }

  async columns(knex: Knex, table: string, schema: string): Promise<ColumnMeta[]> {
    const r = await knex.raw<{
      rows: { name: string; type: string; nullable: boolean; default: string | null; is_pk: boolean; is_auto: boolean }[];
    }>(
      `select a.attname as name, format_type(a.atttypid, a.atttypmod) as type, not a.attnotnull as nullable,
              pg_get_expr(d.adbin, d.adrelid) as default,
              exists(
                select 1 from pg_index i
                where i.indrelid = a.attrelid and a.attnum = any(i.indkey) and i.indisprimary
              ) as is_pk,
              coalesce(a.attidentity <> '', false) or coalesce(pg_get_expr(d.adbin, d.adrelid) like 'nextval(%', false) as is_auto
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
       where n.nspname = ? and c.relname = ? and a.attnum > 0 and not a.attisdropped
       order by a.attnum`,
      [schema, table]
    );
    return r.rows.map((row) => ({
      name: row.name,
      type: row.type,
      nullable: row.nullable,
      default: row.default,
      isPrimaryKey: row.is_pk,
      isAutoIncrement: row.is_auto,
    }));
  }

  // attname é do tipo `name` do Postgres — array_agg(attname) vira `_name` (OID 1003), que o
  // driver `pg` não tem parser registrado por padrão e devolve como string literal "{col}" em
  // vez de array (achado rodando ao vivo contra Postgres de verdade, não pego pelos testes em
  // SQLite). `::text` faz o agregado virar `_text`, que o driver já sabe desserializar.
  async indexes(knex: Knex, table: string, schema: string): Promise<IndexMeta[]> {
    const r = await knex.raw<{ rows: { name: string; unique: boolean; primary: boolean; columns: string[] }[] }>(
      `select i.relname as name, ix.indisunique as unique, ix.indisprimary as primary,
              array_agg(a.attname::text order by array_position(ix.indkey, a.attnum)) as columns
       from pg_index ix
       join pg_class t on t.oid = ix.indrelid
       join pg_class i on i.oid = ix.indexrelid
       join pg_namespace n on n.oid = t.relnamespace
       join pg_attribute a on a.attrelid = t.oid and a.attnum = any(ix.indkey)
       where n.nspname = ? and t.relname = ?
       group by i.relname, ix.indisunique, ix.indisprimary`,
      [schema, table]
    );
    return r.rows;
  }

  async foreignKeys(knex: Knex, schema: string): Promise<ForeignKeyMeta[]> {
    const r = await knex.raw<{
      rows: { name: string; table_name: string; columns: string[]; ref_table: string; ref_columns: string[] }[];
    }>(
      `select con.conname as name, cl.relname as table_name,
              array_agg(att.attname::text order by u.ord) as columns,
              clf.relname as ref_table,
              array_agg(attf.attname::text order by u.ord) as ref_columns
       from pg_constraint con
       join pg_class cl on cl.oid = con.conrelid
       join pg_namespace nsp on nsp.oid = cl.relnamespace
       join pg_class clf on clf.oid = con.confrelid
       join unnest(con.conkey) with ordinality as u(attnum, ord) on true
       join pg_attribute att on att.attrelid = con.conrelid and att.attnum = u.attnum
       join unnest(con.confkey) with ordinality as uf(attnum, ord) on uf.ord = u.ord
       join pg_attribute attf on attf.attrelid = con.confrelid and attf.attnum = uf.attnum
       where con.contype = 'f' and nsp.nspname = ?
       group by con.conname, cl.relname, clf.relname`,
      [schema]
    );
    return r.rows.map((row) => ({
      name: row.name,
      table: row.table_name,
      columns: row.columns,
      refTable: row.ref_table,
      refColumns: row.ref_columns,
    }));
  }

  // Reconstruído a partir de columns()/indexes() em vez de uma segunda consulta gigante — mais
  // simples de manter, e o resultado visual é o mesmo (DB-MOBILE.md §3.3: "DDL reassembled
  // from catalog").
  async ddl(knex: Knex, table: string, schema: string): Promise<string> {
    const [cols, idx] = await Promise.all([this.columns(knex, table, schema), this.indexes(knex, table, schema)]);
    const lines = cols.map((c) => {
      const notNull = c.nullable ? '' : ' NOT NULL';
      const def = c.default ? ` DEFAULT ${c.default}` : '';
      return `  "${c.name}" ${c.type}${notNull}${def}`;
    });
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
