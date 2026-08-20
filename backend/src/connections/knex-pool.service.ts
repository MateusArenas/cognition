import { Injectable, InternalServerErrorException, Logger, OnModuleDestroy } from '@nestjs/common';
import knex, { Knex } from 'knex';

export interface StoredConnectionConfig {
  connection: Record<string, unknown>;
  pool?: Record<string, unknown>;
  searchPath?: string[];
  useNullAsDefault?: boolean;
  version?: string;
  debug?: boolean;
  acquireConnectionTimeout?: number;
}

// Uma instância knex por conexão salva, em memória — cache de conexão ATIVA, não persistência
// (isso é Connection no Prisma, connections.service.ts). DB-MOBILE.md §4.3.
@Injectable()
export class KnexPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(KnexPoolService.name);
  private readonly pools = new Map<string, Knex>();

  // Tradução tela → knexfile: remove chaves vazias (knex reclama de ''), normaliza searchPath e
  // descarta host/porta quando há connectionString — DB-MOBILE.md §2.8.
  toKnexConfig(client: string, cfg: StoredConnectionConfig): Knex.Config {
    const connection = { ...cfg.connection };
    for (const k of Object.keys(connection)) {
      if (connection[k] === '' || connection[k] === undefined) delete connection[k];
    }
    if (typeof connection.connectionString === 'string' && connection.connectionString) {
      delete connection.host;
      delete connection.port;
      delete connection.user;
      delete connection.password;
      delete connection.database;
    }

    const knexConfig: Knex.Config = {
      client,
      connection,
      pool: cfg.pool,
      useNullAsDefault: cfg.useNullAsDefault ?? client.includes('sqlite'),
      debug: cfg.debug ?? false,
      acquireConnectionTimeout: cfg.acquireConnectionTimeout,
    };
    if (cfg.searchPath?.length) (knexConfig as Record<string, unknown>).searchPath = cfg.searchPath;
    if (cfg.version) knexConfig.version = cfg.version;
    return knexConfig;
  }

  getOrCreate(connectionId: string, client: string, cfg: StoredConnectionConfig): Knex {
    const cached = this.pools.get(connectionId);
    if (cached) return cached;
    const instance = knex(this.toKnexConfig(client, cfg));
    this.pools.set(connectionId, instance);
    return instance;
  }

  isConnected(connectionId: string): boolean {
    return this.pools.has(connectionId);
  }

  async status(connectionId: string): Promise<{ connected: boolean; used?: number; free?: number }> {
    const instance = this.pools.get(connectionId);
    if (!instance) return { connected: false };
    const pool = (instance.client as { pool?: { numUsed?: () => number; numFree?: () => number } }).pool;
    return { connected: true, used: pool?.numUsed?.(), free: pool?.numFree?.() };
  }

  async destroy(connectionId: string): Promise<void> {
    const instance = this.pools.get(connectionId);
    if (!instance) return;
    this.pools.delete(connectionId);
    await instance.destroy();
  }

  // Instância descartável pra POST /connections/test — nunca fica em cache.
  async probe(client: string, cfg: StoredConnectionConfig): Promise<{ version?: string; latencyMs: number }> {
    const instance = knex(this.toKnexConfig(client, cfg));
    const started = Date.now();
    try {
      const version = await this.probeVersion(instance, client);
      return { version, latencyMs: Date.now() - started };
    } catch (e) {
      throw e instanceof Error ? e : new InternalServerErrorException('Falha ao testar conexão.');
    } finally {
      await instance.destroy();
    }
  }

  private async probeVersion(instance: Knex, client: string): Promise<string | undefined> {
    if (client.startsWith('pg') || client === 'cockroachdb' || client === 'redshift') {
      const r = await instance.raw('select version() as version');
      return r.rows?.[0]?.version;
    }
    if (client.startsWith('mysql')) {
      const r = await instance.raw('select version() as version');
      return r[0]?.[0]?.version;
    }
    if (client.includes('sqlite')) {
      const r = await instance.raw('select sqlite_version() as version');
      return (r as { version: string }[])[0]?.version;
    }
    if (client === 'mssql') {
      const r = await instance.raw('select @@version as version');
      return r?.[0]?.version;
    }
    // oracledb e outros: um select 1 já confirma que a conexão abre.
    await instance.raw('select 1 as ok from dual');
    return undefined;
  }

  async onModuleDestroy() {
    await Promise.all([...this.pools.values()].map((k) => k.destroy().catch((e: unknown) => this.logger.warn(String(e)))));
    this.pools.clear();
  }
}
