import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrapTestApp } from './bootstrap-app';
import { seedAdminUser, seedViewerUser, VIEWER_PASSWORD } from './seed-auth';

// CASL de verdade, não só a forma da rota: um usuário com role "read Connection" consegue
// listar mas não criar. CHECKLIST.md, Etapa DB1.
describe('Permissões (CASL) — e2e', () => {
  let app: INestApplication;
  let cleanup: () => Promise<void>;
  let viewerToken: string;

  beforeAll(async () => {
    const boot = await bootstrapTestApp();
    app = boot.app;
    cleanup = boot.cleanup;
    await seedAdminUser(boot.prisma);
    await seedViewerUser(boot.prisma);

    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: 'viewer@exemplo.com', password: VIEWER_PASSWORD });
    viewerToken = login.body.accessToken;
  });

  afterAll(() => cleanup());

  it('viewer consegue LER conexões', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/connections').set({ Authorization: `Bearer ${viewerToken}` });
    expect(res.status).toBe(200);
  });

  it('viewer NÃO consegue CRIAR conexão (403, sem chegar a tocar em nenhum banco)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set({ Authorization: `Bearer ${viewerToken}` })
      .send({ name: 'x', client: 'better-sqlite3', config: { connection: { filename: ':memory:' }, useNullAsDefault: true } });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('viewer NÃO consegue gerenciar roles', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/roles').set({ Authorization: `Bearer ${viewerToken}` });
    expect(res.status).toBe(403);
  });
});
