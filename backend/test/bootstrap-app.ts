import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { MailMessage, MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import type { PrismaClient as TestPrismaClient } from '../src/generated/prisma-test';
import { createTestPrismaClient } from './prisma-test-client';

// Fake em memória — sem SMTP real neste ambiente, e2e de esqueci/redefinir senha precisa
// inspecionar o token enviado sem depender de rede nenhuma.
class FakeMailService implements Pick<MailService, 'send'> {
  sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

// Sobe o app Nest REAL (mesmos módulos/guards/filtros de produção) contra o Prisma de teste
// (SQLite) via overrideProvider — nenhum módulo de aplicação sabe que está em teste. `prisma`
// devolvido pro teste poder semear usuário/role/permissão direto, sem passar pela API.
export async function bootstrapTestApp(): Promise<{
  app: INestApplication;
  prisma: TestPrismaClient;
  mail: FakeMailService;
  cleanup: () => Promise<void>;
}> {
  process.env.JWT_SECRET ??= 'test-secret';
  process.env.JWT_EXPIRES_IN ??= '1h';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
  process.env.JWT_REFRESH_EXPIRES_IN ??= '1h';
  process.env.APP_SECRET ??= 'test-app-secret';

  const { prisma, cleanup: cleanupPrisma } = createTestPrismaClient();
  const mail = new FakeMailService();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma as unknown as PrismaService)
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return {
    app,
    prisma,
    mail,
    cleanup: async () => {
      await app.close();
      cleanupPrisma();
    },
  };
}
