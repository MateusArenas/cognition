import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { ConnectionsService } from '../connections/connections.service';
import { KnexPoolService } from '../connections/knex-pool.service';
import { FiltersService } from '../catalog/filters.service';
import { IntrospectService } from '../catalog/introspect.service';
import type { ColumnMeta } from '../catalog/dialects/dialect.types';
import { DialectRegistry } from '../catalog/dialects/dialect.registry';
import { MutationChangeDto, MutationChangeResult, MutationsDto, MutationsResult } from './dto/mutation.dto';

const RETURNING_FAMILIES = new Set(['pg', 'mssql']);

// Buffer local (edição de célula, exclusão, duplicação) do app vira UMA transação por chamada
// aqui — nunca statement digitado (a "REGRA DE PROJETO" do DB-MOBILE.md vale igual pra
// escrita): toda coluna referenciada em values/key/set/was é validada contra o catálogo real
// antes de qualquer builder tocar nela.
@Injectable()
export class MutationsService {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly pool: KnexPoolService,
    private readonly registry: DialectRegistry,
    private readonly introspect: IntrospectService,
    private readonly filters: FiltersService
  ) {}

  private async context(connectionId: string, ownerId: string, table: string) {
    const conn = await this.connections.findOwned(connectionId, ownerId);
    const cfg = await this.connections.decryptedConfig(connectionId, ownerId);
    const knex = this.pool.getOrCreate(connectionId, conn.client, cfg);
    const strategy = this.registry.for(conn.client);
    const detail = await this.introspect.tableDetail(connectionId, ownerId, table);
    const pk = detail.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
    if (!pk.length) throw new BadRequestException({ message: `Tabela "${table}" sem chave primária — não é possível editar.`, code: 'NO_PK' });
    return { knex, client: conn.client, family: strategy.family, columns: detail.columns, pk, table };
  }

  private assertColumns(obj: Record<string, unknown> | undefined, valid: ReadonlySet<string>) {
    for (const key of Object.keys(obj ?? {})) this.filters.assertColumn(key, valid);
  }

  private assertPk(change: MutationChangeDto, pk: string[]) {
    for (const col of pk) {
      const v = change.key?.[col];
      if (v === null || v === undefined) {
        throw new BadRequestException({ message: `Chave primária "${col}" ausente ou nula.`, code: 'NULL_PK' });
      }
    }
  }

  private order(changes: MutationChangeDto[]): MutationChangeDto[] {
    const rank = { insert: 0, update: 1, delete: 2 } as const;
    return [...changes].sort((a, b) => rank[a.kind] - rank[b.kind]);
  }

  async preview(connectionId: string, ownerId: string, table: string, dto: MutationsDto): Promise<{ statements: string[] }> {
    const ctx = await this.context(connectionId, ownerId, table);
    const valid = new Set(ctx.columns.map((c) => c.name));
    const statements: string[] = [];
    for (const change of this.order(dto.changes)) {
      const q = this.buildQuery(ctx.knex, ctx.table, ctx.family, change, valid, ctx.pk, dto.optimistic ?? true);
      statements.push(q.toString());
    }
    return { statements };
  }

  async apply(connectionId: string, ownerId: string, table: string, dto: MutationsDto): Promise<MutationsResult> {
    const ctx = await this.context(connectionId, ownerId, table);
    const valid = new Set(ctx.columns.map((c) => c.name));
    const ordered = this.order(dto.changes);
    const started = Date.now();

    const results = await ctx.knex.transaction(async (trx: Knex.Transaction) => {
      const out: MutationChangeResult[] = [];
      for (let i = 0; i < ordered.length; i++) {
        const change = ordered[i];
        const result = await this.applyOne(trx, ctx.table, ctx.family, change, valid, ctx.pk, ctx.columns, dto.optimistic ?? true);
        if (result.affected !== 1) {
          throw new ConflictException({
            message: `A linha ${i} foi alterada por outra sessão — nada foi salvo.`,
            code: 'CONFLICT',
            index: i,
            affected: result.affected,
          });
        }
        out.push(result);
      }
      return out;
    });

    return { ok: true, applied: results.length, durationMs: Date.now() - started, results };
  }

  private buildQuery(
    knexOrTrx: Knex | Knex.Transaction,
    table: string,
    family: string,
    change: MutationChangeDto,
    valid: ReadonlySet<string>,
    pk: string[],
    optimistic: boolean
  ): Knex.QueryBuilder {
    if (change.kind === 'insert') {
      this.assertColumns(change.values, valid);
      const q = knexOrTrx(table).insert(change.values ?? {});
      if (RETURNING_FAMILIES.has(family)) q.returning(pk);
      return q;
    }
    this.assertPk(change, pk);
    this.assertColumns(change.key, valid);
    const where = { ...change.key } as Record<string, unknown>;
    if (change.kind === 'update') {
      this.assertColumns(change.set, valid);
      if (optimistic) {
        this.assertColumns(change.was, valid);
        Object.assign(where, change.was ?? {});
      }
      return knexOrTrx(table).where(where).update(change.set ?? {});
    }
    // delete: trava otimista só pela PK (não usa `was` — DB-MOBILE.md §4.9)
    return knexOrTrx(table).where(where).del();
  }

  private async applyOne(
    trx: Knex.Transaction,
    table: string,
    family: string,
    change: MutationChangeDto,
    valid: ReadonlySet<string>,
    pk: string[],
    columns: ColumnMeta[],
    optimistic: boolean
  ): Promise<MutationChangeResult> {
    const q = this.buildQuery(trx, table, family, change, valid, pk, optimistic);
    if (change.kind === 'insert') {
      const inserted = await q;
      const returned = this.extractInsertedKey(inserted, pk, columns);
      return { kind: 'insert', affected: 1, returned };
    }
    const affected = (await q) as unknown as number;
    return { kind: change.kind, affected: Number(affected) };
  }

  private extractInsertedKey(inserted: unknown, pk: string[], columns: ColumnMeta[]): Record<string, unknown> | undefined {
    if (Array.isArray(inserted) && inserted.length) {
      const first = inserted[0];
      if (typeof first === 'object' && first !== null) return first as Record<string, unknown>;
      const autoIncrement = columns.find((c) => c.isAutoIncrement)?.name ?? pk[0];
      return autoIncrement ? { [autoIncrement]: first } : undefined;
    }
    return undefined;
  }
}
