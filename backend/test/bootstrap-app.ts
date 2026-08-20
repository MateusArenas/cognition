import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import type { PrismaClient as TestPrismaClient } from '../src/generated/prisma-test';
import { createTestPrismaClient } from './prisma-test-client';

// Sobe o app Nest REAL (mesmos módulos/guards/filtros de produção) contra o Prisma de teste
// (SQLite) via overrideProvider — nenhum módulo de aplicação sabe que está em teste. `prisma`
// devolvido pro teste poder semear usuário/role/permissão direto, sem passar pela API.
export async function bootstrapTestApp(): Promise<{ app: INestApplication; prisma: TestPrismaClient; cleanup: () => Promise<void> }> {
  process.env.JWT_SECRET ??= 'test-secret';
  process.env.JWT_EXPIRES_IN ??= '1h';
  process.env.APP_SECRET ??= 'test-app-secret';

  const { prisma, cleanup: cleanupPrisma } = createTestPrismaClient();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma as unknown as PrismaService)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return {
    app,
    prisma,
    cleanup: async () => {
      await app.close();
      cleanupPrisma();
    },
  };
}
