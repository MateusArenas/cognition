import { http } from './http';
import { R } from './routes';
import type {
  ConnectionConfig,
  DbConnection,
  DriverInfo,
  FilterInput,
  LoginResult,
  MutationChange,
  MutationsResult,
  RowsResult,
  TableDetail,
  TableRef,
} from '../types';

// Uma função por rota, tipada — DB-MOBILE.md §2.3. Se o backend mudar de rota, o diff é aqui.
export async function login(email: string, password: string): Promise<LoginResult> {
  const { data } = await http.post<LoginResult>(R.login(), { email, password });
  return data;
}

export async function drivers(): Promise<DriverInfo[]> {
  const { data } = await http.get<DriverInfo[]>(R.drivers());
  return data;
}

export async function listConnections(): Promise<DbConnection[]> {
  const { data } = await http.get<DbConnection[]>(R.connections());
  return data;
}

export async function getConnection(id: string): Promise<DbConnection> {
  const { data } = await http.get<DbConnection>(R.connection(id));
  return data;
}

export interface ConnectionInput {
  name: string;
  color?: string;
  client: string;
  config: ConnectionConfig;
  readOnly?: boolean;
}

export async function createConnection(input: ConnectionInput): Promise<DbConnection> {
  const { data } = await http.post<DbConnection>(R.connections(), input);
  return data;
}

export async function updateConnection(id: string, input: Partial<ConnectionInput>): Promise<DbConnection> {
  const { data } = await http.patch<DbConnection>(R.connection(id), input);
  return data;
}

export async function deleteConnection(id: string): Promise<void> {
  await http.delete(R.connection(id));
}

export async function testConnection(client: string, config: ConnectionConfig): Promise<{ version?: string; latencyMs: number }> {
  const { data } = await http.post(R.connectionTest(), { client, config });
  return data;
}

export async function connect(id: string): Promise<{ connected: boolean }> {
  const { data } = await http.post(R.connect(id));
  return data;
}

export async function disconnect(id: string): Promise<{ connected: boolean }> {
  const { data } = await http.post(R.disconnect(id));
  return data;
}

export async function status(id: string): Promise<{ connected: boolean; used?: number; free?: number }> {
  const { data } = await http.get(R.status(id));
  return data;
}

export async function tables(id: string): Promise<TableRef[]> {
  const { data } = await http.get<TableRef[]>(R.tables(id));
  return data;
}

export async function tableDetail(id: string, table: string): Promise<TableDetail> {
  const { data } = await http.get<TableDetail>(R.table(id, table));
  return data;
}

export async function tableDdl(id: string, table: string): Promise<string> {
  const { data } = await http.get<{ sql: string }>(R.tableDdl(id, table));
  return data.sql;
}

export interface RowsParams {
  columns?: string[];
  limit?: number;
  offset?: number;
  orderBy?: string;
  dir?: 'asc' | 'desc';
  filters?: FilterInput[];
  q?: string;
  qMode?: 'tudo' | 'texto';
}

export async function rows(id: string, table: string, params: RowsParams = {}): Promise<RowsResult> {
  const { data } = await http.get<RowsResult>(R.rows(id, table), {
    params: {
      columns: params.columns?.join(','),
      limit: params.limit,
      offset: params.offset,
      orderBy: params.orderBy,
      dir: params.dir,
      filters: params.filters?.length ? JSON.stringify(params.filters) : undefined,
      q: params.q || undefined,
      qMode: params.qMode,
    },
  });
  return data;
}

export async function tableErd(id: string, table: string, depth = 1, opts: { columns?: boolean; keysOnly?: boolean } = {}): Promise<string> {
  const { data } = await http.get<{ mermaid: string }>(R.tableErd(id, table), { params: { depth, columns: opts.columns, keysOnly: opts.keysOnly } });
  return data.mermaid;
}

export async function schemaErd(id: string, opts: { columns?: boolean; keysOnly?: boolean } = {}): Promise<string> {
  const { data } = await http.get<{ mermaid: string }>(R.erd(id), { params: opts });
  return data.mermaid;
}

export async function mutationsPreview(id: string, table: string, changes: MutationChange[], optimistic = true): Promise<{ statements: string[] }> {
  const { data } = await http.post(R.mutationsPreview(id, table), { changes, optimistic });
  return data;
}

export async function applyMutations(id: string, table: string, changes: MutationChange[], optimistic = true): Promise<MutationsResult> {
  const { data } = await http.post<MutationsResult>(R.mutations(id, table), { changes, optimistic });
  return data;
}

// Console SQL livre — Etapa DB2. Única rota do app em que o texto do usuário vira a consulta
// de verdade; a validação de somente-leitura (SELECT/WITH, uma instrução, sem JOIN pra editar)
// é toda do backend (sql-safety.ts) — aqui só repassa e deixa o erro 400 (código UNSAFE_QUERY)
// subir pra tela mostrar. `allowWrite` (Etapa DB3) espelha o toggle "Permitir alterar dados" da
// aba Consulta — sem ele, INSERT/UPDATE/DELETE continuam rejeitados pelo backend mesmo que
// alguém contorne a checagem do app (a fonte de verdade é sempre o servidor).
export async function runQuery(id: string, sql: string, allowWrite = false): Promise<RowsResult> {
  const { data } = await http.post<RowsResult>(R.query(id), { sql, allowWrite });
  return data;
}
