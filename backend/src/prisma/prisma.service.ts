import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma';

// Dados PRÓPRIOS do backend (usuários, roles, permissões, registro de conexões) — nunca os
// bancos-alvo, que passam por Knex (ver connections/knex-pool.service.ts). Prisma 7 usa
// adaptador de driver explícito (@prisma/adapter-pg) em vez de ler a URL do schema.prisma.
//
// Em teste, esta classe NUNCA é instanciada de verdade — test/prisma-test-client.ts monta um
// PrismaClient equivalente a partir do schema SQLite (prisma/schema.test.prisma) e o injeta no
// lugar via `overrideProvider(PrismaService)`, então nenhum código de aplicação muda entre os
// dois ambientes.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL não configurada — veja backend/.env.example.');
    }
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Conectado ao Postgres de dados próprios do backend.');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
