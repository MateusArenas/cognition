import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { ConnectionsService } from '../connections/connections.service';
import { KnexPoolService, StoredConnectionConfig } from '../connections/knex-pool.service';
import { DialectRegistry } from './dialects/dialect.registry';
import type { ColumnMeta, DialectStrategy, ForeignKeyMeta, IndexMeta, TableRef } from './dialects/dialect.types';
import { RowsQueryDto } from './dto/rows-query.dto';
import { FiltersService } from './filters.service';
import { checkReadOnlySql } from './sql-safety';

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
  /** Só presente quando rawQuery() rodou um INSERT/UPDATE/DELETE (allowWrite) — `rows`/`fields`
   *  ficam vazios nesse caso, não faz sentido tentar exibir grade pra um comando de escrita. */
  affectedRows?: number;
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

// Orquestra estratégia (dialeto) + Knex — CatalogController nunca sabe qual SQL foi usado.
// DB-MOBILE.md §4.2/§4.6.
@Injectable()
export class IntrospectService {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly pool: KnexPoolService,
    private readonly registry: DialectRegistry,
    private readonly filters: FiltersService
  ) {}

  private async resolve(connectionId: string, ownerId: string): Promise<{ knex: Knex; strategy: DialectStrategy; client: string; schema: string; readOnly: boolean }> {
    const conn = await this.connections.findOwned(connectionId, ownerId);
    const cfg = await this.connections.decryptedConfig(connectionId, ownerId);
    const knex = this.pool.getOrCreate(connectionId, conn.client, cfg);
    const strategy = this.registry.for(conn.client);
    return { knex, strategy, client: conn.client, schema: this.defaultSchema(conn.client, cfg, strategy), readOnly: conn.readOnly };
  }

  private defaultSchema(client: string, cfg: StoredConnectionConfig, strategy: DialectStrategy): string {
    if (client === 'mysql2' && cfg.connection.database) return String(cfg.connection.database);
    if (client.startsWith('pg') && cfg.searchPath?.length) return cfg.searchPath[0];
    return strategy.defaultSchema();
  }

  async databases(connectionId: string, ownerId: string) {
    const { knex, strategy } = await this.resolve(connectionId, ownerId);
    return strategy.listDatabases(knex);
  }

  async schemas(connectionId: string, ownerId: string) {
    const { knex, strategy } = await this.resolve(connectionId, ownerId);
    return strategy.listSchemas(knex);
  }

  async tables(connectionId: string, ownerId: string, schemaOverride?: string): Promise<TableRef[]> {
    const { knex, strategy, schema } = await this.resolve(connectionId, ownerId);
    return strategy.listTables(knex, schemaOverride || schema);
  }

  private async findTableRef(connectionId: string, ownerId: string, table: string, schemaOverride?: string): Promise<TableRef> {
    const list = await this.tables(connectionId, ownerId, schemaOverride);
    const found = list.find((t) => t.name === table);
    if (!found) throw new BadRequestException({ message: `Tabela "${table}" não encontrada.`, code: 'TABLE_NOT_FOUND' });
    return found;
  }

  async tableDetail(connectionId: string, ownerId: string, table: string, schemaOverride?: string): Promise<TableDetail> {
    const { knex, strategy, schema } = await this.resolve(connectionId, ownerId);
    const effectiveSchema = schemaOverride || schema;
    const ref = await this.findTableRef(connectionId, ownerId, table, effectiveSchema);
    const [columns, indexes, allFks] = await Promise.all([
      strategy.columns(knex, table, effectiveSchema),
      strategy.indexes(knex, table, effectiveSchema),
      strategy.foreignKeys(knex, effectiveSchema),
    ]);
    return {
      name: table,
      schema: effectiveSchema,
      type: ref.type,
      columns,
      indexes,
      foreignKeys: allFks.filter((fk) => fk.table === table),
      referencedBy: allFks.filter((fk) => fk.refTable === table && fk.table !== table),
    };
  }

  async ddl(connectionId: string, ownerId: string, table: string, schemaOverride?: string): Promise<string> {
    const { knex, strategy, schema } = await this.resolve(connectionId, ownerId);
    return strategy.ddl(knex, table, schemaOverride || schema);
  }

  async count(connectionId: string, ownerId: string, table: string, schemaOverride?: string): Promise<number> {
    const { knex, client, schema } = await this.resolve(connectionId, ownerId);
    const query = this.baseQuery(knex, client, table, schemaOverride || schema);
    const row = await query.count<{ c: number }[]>({ c: '*' }).first();
    return row ? Number((row as unknown as { c: number }).c) : 0;
  }

  private baseQuery(knex: Knex, client: string, table: string, schema: string): Knex.QueryBuilder {
    if ((client.startsWith('pg') || client === 'mssql' || client === 'tedious') && schema) {
      return knex(table).withSchema(schema);
    }
    return knex(table);
  }

  async rows(connectionId: string, ownerId: string, table: string, query: RowsQueryDto, schemaOverride?: string): Promise<RowsResult> {
    const { knex, strategy, client, schema, readOnly } = await this.resolve(connectionId, ownerId);
    const effectiveSchema = schemaOverride || schema;
    const [ref, columns] = await Promise.all([
      this.findTableRef(connectionId, ownerId, table, effectiveSchema),
      strategy.columns(knex, table, effectiveSchema),
    ]);
    const validColumns = new Set(columns.map((c) => c.name));

    const projected = query.columns
      ? query.columns
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
      : columns.map((c) => c.name);
    projected.forEach((c) => this.filters.assertColumn(c, validColumns));

    const filters = this.filters.parseFilters(query.filters);
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const build = () => {
      const q = this.baseQuery(knex, client, table, effectiveSchema);
      this.filters.applyFilters(q, filters, validColumns);
      return q;
    };

    let colunasBuscadas = 0;
    const countQuery = build();
    if (query.q?.trim()) colunasBuscadas = this.filters.applySearch(countQuery, query.q, columns, strategy.family, query.qMode);
    const totalRow = await countQuery.clone().count<{ c: number }[]>({ c: '*' }).first();
    const total = totalRow ? Number((totalRow as unknown as { c: number }).c) : 0;

    const dataQuery = countQuery.clone().select(projected);
    if (query.orderBy) {
      this.filters.assertColumn(query.orderBy, validColumns);
      dataQuery.orderBy(query.orderBy, query.dir ?? 'asc');
    }
    dataQuery.limit(limit).offset(offset);

    const objectRows = (await dataQuery) as Record<string, unknown>[];
    const rows = objectRows.map((r) => projected.map((c) => r[c]));
    const fields = projected.map((name) => ({ name, type: columns.find((c) => c.name === name)?.type ?? 'unknown' }));

    const pk = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
    const autoIncrement = columns.filter((c) => c.isAutoIncrement).map((c) => c.name);
    const pkNaProjecao = pk.every((k) => projected.includes(k));
    let motivoBloqueio: string | undefined;
    if (ref.type !== 'table') motivoBloqueio = 'Views não são editáveis.';
    else if (!pk.length) motivoBloqueio = `Tabela sem chave primária: ${table}.`;
    else if (!pkNaProjecao) motivoBloqueio = `Inclua a chave primária (${pk.join(', ')}) nas colunas para poder editar.`;
    else if (readOnly) motivoBloqueio = 'Conexão marcada como somente leitura.';

    return {
      fields,
      rows,
      total,
      totalSemFiltro: ref.rowCount ?? total,
      offset,
      limit,
      colunasBuscadas,
      edicao: { table, primaryKey: pk, autoIncrement, editavel: !motivoBloqueio, motivoBloqueio },
    };
  }

  // Console SQL livre (Etapa DB2, pedido explícito do usuário — diferente do resto do app,
  // aqui o texto digitado VIRA a consulta de verdade). Único ponto de exceção à "REGRA DE
  // PROJETO"; a proteção é checkReadOnlySql() (sql-safety.ts): por padrão só SELECT/WITH, uma
  // instrução, sem palavra de escrita em lugar nenhum da string. `editavel` segue a MESMA lógica
  // de rows() — só que a tabela de origem é inferida da consulta (regex `FROM <tabela>`, sem
  // JOIN) em vez de vir do parâmetro de rota.
  //
  // `allowWrite` — toggle da aba Consulta, terceiro pedido do usuário — libera INSERT/UPDATE/
  // DELETE. Mesmo com o toggle ligado no app, uma conexão marcada `readOnly` ainda bloqueia:
  // o toggle é "permita ao app mandar escrita", não "ignore a marcação da conexão" — mesmo
  // código/mensagem READ_ONLY que ReadOnlyGuard usa pras rotas de mutations, por consistência.
  async rawQuery(connectionId: string, ownerId: string, sql: string, allowWrite = false): Promise<RowsResult> {
    const safety = checkReadOnlySql(sql, { allowWrite });
    if (!safety.ok) {
      throw new BadRequestException({ message: safety.reason, code: 'UNSAFE_QUERY' });
    }

    const { knex, strategy, client, schema, readOnly } = await this.resolve(connectionId, ownerId);

    if (safety.isWrite) {
      if (readOnly) {
        throw new ForbiddenException({ message: 'Conexão marcada como somente leitura.', code: 'READ_ONLY' });
      }
      const statement = sql.trim().replace(/;+\s*$/, '');
      const result = await knex.raw(statement);
      const affectedRows = this.extractAffectedRows(client, result);
      return {
        fields: [],
        rows: [],
        total: affectedRows,
        totalSemFiltro: affectedRows,
        offset: 0,
        limit: affectedRows,
        colunasBuscadas: 0,
        affectedRows,
        edicao: { table: safety.table, primaryKey: [], autoIncrement: [], editavel: false },
      };
    }

    const statement = sql.trim().replace(/;+\s*$/, '');
    const result = await knex.raw(statement);
    const { rows, fields } = this.extractRowsAndFields(client, result);

    let edicao: RowsResult['edicao'] = {
      primaryKey: [],
      autoIncrement: [],
      editavel: false,
      motivoBloqueio: safety.hasJoin ? 'Consultas com JOIN (mais de uma tabela) não são editáveis.' : 'Consulta sem uma tabela de origem identificável.',
    };
    if (!safety.hasJoin && safety.table) {
      try {
        const columns = await strategy.columns(knex, safety.table, schema);
        const pk = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
        const autoIncrement = columns.filter((c) => c.isAutoIncrement).map((c) => c.name);
        const projected = fields.map((f) => f.name);
        const pkNaProjecao = pk.length > 0 && pk.every((k) => projected.includes(k));
        let motivoBloqueio: string | undefined;
        if (!pk.length) motivoBloqueio = `Tabela "${safety.table}" sem chave primária.`;
        else if (!pkNaProjecao) motivoBloqueio = `Inclua a chave primária (${pk.join(', ')}) no SELECT para poder editar.`;
        else if (readOnly) motivoBloqueio = 'Conexão marcada como somente leitura.';
        edicao = { table: safety.table, primaryKey: pk, autoIncrement, editavel: !motivoBloqueio, motivoBloqueio };
      } catch {
        edicao = { primaryKey: [], autoIncrement: [], editavel: false, motivoBloqueio: `Não foi possível confirmar a tabela "${safety.table}" no catálogo.` };
      }
    }

    return { fields, rows, total: rows.length, totalSemFiltro: rows.length, offset: 0, limit: rows.length, colunasBuscadas: 0, edicao };
  }

  // Cada driver devolve o resultado de `knex.raw()` numa forma diferente — normaliza pro mesmo
  // formato matriz de rows()/RowsResult. Sem metadado de tipo por coluna aqui (só pg carrega
  // isso em `result.fields`); os outros usam as chaves da primeira linha.
  private extractRowsAndFields(client: string, result: unknown): { rows: unknown[][]; fields: { name: string; type: string }[] } {
    let objectRows: Record<string, unknown>[] = [];
    let fieldNames: string[] | null = null;

    if (client.startsWith('pg') || client === 'cockroachdb' || client === 'redshift') {
      const r = result as { rows?: Record<string, unknown>[]; fields?: { name: string }[] };
      objectRows = r.rows ?? [];
      if (r.fields) fieldNames = r.fields.map((f) => f.name);
    } else if (client.startsWith('mysql')) {
      const r = result as [Record<string, unknown>[], { name: string }[]];
      objectRows = Array.isArray(r?.[0]) ? r[0] : [];
      if (Array.isArray(r?.[1])) fieldNames = r[1].map((f) => f.name);
    } else {
      objectRows = Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
    }

    if (!fieldNames) fieldNames = objectRows.length ? Object.keys(objectRows[0]) : [];
    const fields = fieldNames.map((name) => ({ name, type: 'unknown' }));
    const rows = objectRows.map((r) => fieldNames!.map((name) => r[name]));
    return { rows, fields };
  }

  // Resultado de INSERT/UPDATE/DELETE (console em modo allowWrite) não tem linhas pra desenhar
  // grade — só a contagem de linhas afetadas, e cada driver devolve isso numa forma diferente.
  // Só o caminho sqlite (better-sqlite3, `result.changes`) e pg (`result.rowCount`) foram
  // validados ao vivo neste ambiente; mysql/mssql seguem a forma documentada dos drivers
  // (mysql2: `ResultSetHeader.affectedRows`; tedious: soma de `rowsAffected[]`) mas sem teste de
  // integração ao vivo — mesma lacuna já disclosed pros outros dialetos no resto do catálogo.
  private extractAffectedRows(client: string, result: unknown): number {
    if (client.startsWith('pg') || client === 'cockroachdb' || client === 'redshift') {
      return (result as { rowCount?: number }).rowCount ?? 0;
    }
    if (client.startsWith('mysql')) {
      const r = result as [{ affectedRows?: number }, unknown];
      return r?.[0]?.affectedRows ?? 0;
    }
    if (client === 'tedious') {
      const r = result as { rowsAffected?: number[] };
      return (r.rowsAffected ?? []).reduce((total, n) => total + n, 0);
    }
    const r = result as { changes?: number };
    return r.changes ?? 0;
  }

  // Cancelamento de consulta em andamento — só Postgres tem um jeito padronizado e barato
  // (`pg_cancel_backend`), ver DB-MOBILE.md §4.8. Outros dialetos respondem "não suportado" em
  // vez de fingir que cancelaram.
  async cancel(connectionId: string, ownerId: string): Promise<{ cancelled: boolean; message?: string }> {
    const { knex, client } = await this.resolve(connectionId, ownerId);
    if (!client.startsWith('pg')) {
      return { cancelled: false, message: `Cancelamento não suportado no dialeto "${client}".` };
    }
    const r = await knex.raw('select pg_cancel_backend(pid) as ok from pg_stat_activity where state = ? and pid <> pg_backend_pid()', ['active']);
    return { cancelled: !!r.rows?.length };
  }
}
