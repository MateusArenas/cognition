import type { Knex } from 'knex';

export type Family = 'pg' | 'mysql' | 'sqlite' | 'mssql' | 'oracle';

export interface TableRef {
  name: string;
  schema: string;
  type: 'table' | 'view';
  rowCount?: number;
  sizeBytes?: number;
}

export interface ColumnMeta {
  name: string;
  type: string;
  nullable: boolean;
  default?: string | null;
  isPrimaryKey: boolean;
  isAutoIncrement: boolean;
}

export interface IndexMeta {
  name: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
}

export interface ForeignKeyMeta {
  name: string;
  table: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
}

// Controller/IntrospectService não conhecem dialeto — pedem `strategy.tables(knex, schema)` e
// o registro (dialect.registry.ts) decide se vai em pg_class, information_schema ou PRAGMA.
// DB-MOBILE.md §4.2 ("Regra que evita bagunça: controller não conhece dialeto").
export interface DialectStrategy {
  readonly family: Family;
  readonly clients: string[];
  defaultSchema(): string;
  listSchemas(knex: Knex): Promise<string[]>;
  listDatabases(knex: Knex): Promise<string[]>;
  listTables(knex: Knex, schema: string): Promise<TableRef[]>;
  columns(knex: Knex, table: string, schema: string): Promise<ColumnMeta[]>;
  indexes(knex: Knex, table: string, schema: string): Promise<IndexMeta[]>;
  foreignKeys(knex: Knex, schema: string): Promise<ForeignKeyMeta[]>;
  ddl(knex: Knex, table: string, schema: string): Promise<string>;
}
