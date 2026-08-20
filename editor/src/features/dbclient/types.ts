// Contratos que trafegam nas rotas do backend (backend/src/**/dto, ver docs/17-db-client.md).
// Espelha as respostas de verdade — mudou lá, muda aqui, é o único lugar que sabe a forma do
// JSON (nenhuma tela monta objeto solto).

export interface DriverInfo {
  client: string;
  family: 'pg' | 'mysql' | 'sqlite' | 'mssql' | 'oracle';
  label: string;
  installed: boolean;
}

export interface ConnectionConfig {
  connection: Record<string, unknown>;
  pool?: Record<string, unknown>;
  searchPath?: string[];
  useNullAsDefault?: boolean;
  debug?: boolean;
}

export interface DbConnection {
  id: string;
  name: string;
  color: string;
  client: string;
  config: ConnectionConfig;
  readOnly: boolean;
  connected: boolean;
}

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

export interface TableDetail {
  name: string;
  schema: string;
  type: 'table' | 'view';
  columns: ColumnMeta[];
  indexes: IndexMeta[];
  foreignKeys: ForeignKeyMeta[];
  referencedBy: ForeignKeyMeta[];
}

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'in' | 'between' | 'isNull' | 'notNull';

export interface FilterInput {
  column: string;
  op: FilterOp;
  value?: unknown;
}

export interface RowsResult {
  fields: { name: string; type: string }[];
  rows: unknown[][];
  total: number;
  totalSemFiltro: number;
  offset: number;
  limit: number;
  colunasBuscadas: number;
  edicao: {
    table?: string;
    primaryKey: string[];
    autoIncrement: string[];
    editavel: boolean;
    motivoBloqueio?: string;
  };
}

export type MutationKind = 'insert' | 'update' | 'delete';

export interface MutationChange {
  kind: MutationKind;
  values?: Record<string, unknown>;
  key?: Record<string, unknown>;
  set?: Record<string, unknown>;
  was?: Record<string, unknown>;
}

export interface MutationsResult {
  ok: boolean;
  applied: number;
  durationMs: number;
  results: { kind: MutationKind; affected: number; returned?: Record<string, unknown> }[];
}

export interface ApiErrorBody {
  message: string;
  code?: string;
  position?: number;
  hint?: string;
  index?: number;
  affected?: number;
}

export interface LoginResult {
  accessToken: string;
  user: { id: string; email: string; name: string; roles: string[] };
}
