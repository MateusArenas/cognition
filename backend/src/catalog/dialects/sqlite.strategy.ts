import type { Knex } from 'knex';
import type { ColumnMeta, DialectStrategy, ForeignKeyMeta, IndexMeta, TableRef } from './dialect.types';

interface SqliteMasterRow {
  name: string;
  type: string;
  sql: string | null;
}
interface TableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}
interface IndexListRow {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}
interface IndexInfoRow {
  seqno: number;
  cid: number;
  name: string;
}
interface ForeignKeyListRow {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
}

// SQLite: sem servidor, sem schema de verdade — só o `PRAGMA` que o próprio driver expõe.
// Identificador sempre por `??` (knex substitui do lado do cliente, não é bind de valor) e
// sempre vindo do catálogo (nunca digitado pelo usuário) — DB-MOBILE.md, "REGRA DE PROJETO".
export class SqliteStrategy implements DialectStrategy {
  readonly family = 'sqlite' as const;
  readonly clients = ['sqlite3', 'better-sqlite3'];

  defaultSchema(): string {
    return 'main';
  }

  async listSchemas(): Promise<string[]> {
    return ['main'];
  }

  async listDatabases(): Promise<string[]> {
    return [];
  }

  async listTables(knex: Knex): Promise<TableRef[]> {
    const rows = await knex<SqliteMasterRow>('sqlite_master')
      .select('name', 'type')
      .whereIn('type', ['table', 'view'])
      .andWhereNot('name', 'like', 'sqlite_%')
      .orderBy('name');

    const out: TableRef[] = [];
    for (const r of rows) {
      let rowCount: number | undefined;
      if (r.type === 'table') {
        const c = await knex(r.name).count<{ c: number }[]>({ c: '*' }).first();
        rowCount = c ? Number((c as unknown as { c: number }).c) : undefined;
      }
      out.push({ name: r.name, schema: 'main', type: r.type === 'view' ? 'view' : 'table', rowCount });
    }
    return out;
  }

  async columns(knex: Knex, table: string): Promise<ColumnMeta[]> {
    const rows = await knex.raw<TableInfoRow[]>('PRAGMA table_info(??)', [table]);
    const list = (Array.isArray(rows) ? rows : []) as TableInfoRow[];
    return list.map((c) => ({
      name: c.name,
      type: c.type || 'text',
      nullable: c.notnull === 0,
      default: c.dflt_value,
      isPrimaryKey: c.pk > 0,
      isAutoIncrement: c.pk > 0 && /integer/i.test(c.type || ''),
    }));
  }

  async indexes(knex: Knex, table: string): Promise<IndexMeta[]> {
    const list = (await knex.raw<IndexListRow[]>('PRAGMA index_list(??)', [table])) as unknown as IndexListRow[];
    const out: IndexMeta[] = [];
    for (const idx of list) {
      const infoRows = (await knex.raw<IndexInfoRow[]>('PRAGMA index_info(??)', [idx.name])) as unknown as IndexInfoRow[];
      out.push({
        name: idx.name,
        columns: infoRows.map((c) => c.name),
        unique: idx.unique === 1,
        primary: idx.origin === 'pk',
      });
    }
    return out;
  }

  async foreignKeys(knex: Knex, schema: string): Promise<ForeignKeyMeta[]> {
    const tables = await this.listTables(knex);
    const out: ForeignKeyMeta[] = [];
    for (const t of tables) {
      if (t.type !== 'table') continue;
      const rows = (await knex.raw<ForeignKeyListRow[]>('PRAGMA foreign_key_list(??)', [t.name])) as unknown as ForeignKeyListRow[];
      const byId = new Map<number, ForeignKeyListRow[]>();
      for (const r of rows) byId.set(r.id, [...(byId.get(r.id) ?? []), r]);
      for (const [id, group] of byId) {
        out.push({
          name: `${t.name}_fk_${id}`,
          table: t.name,
          columns: group.map((g) => g.from),
          refTable: group[0].table,
          refColumns: group.map((g) => g.to),
        });
      }
    }
    return out;
  }

  async ddl(knex: Knex, table: string): Promise<string> {
    const row = await knex<SqliteMasterRow>('sqlite_master').select('sql').where({ name: table }).first();
    return row?.sql ?? '';
  }
}
