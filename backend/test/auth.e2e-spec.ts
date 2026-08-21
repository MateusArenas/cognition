import type { INestApplication } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { bootstrapTestApp } from './bootstrap-app';

// Ponta a ponta do rework de autenticação: cadastro, login por e-mail E por username, refresh
// (rotação + detecção de reuso), token de acesso expirado vs. inválido, /me, logout,
// esqueci/redefinir senha. CHECKLIST.md, Etapa Auth.
describe('Autenticação (e2e)', () => {
  let app: INestApplication;
  let cleanup: () => Promise<void>;
  let mail: Awaited<ReturnType<typeof bootstrapTestApp>>['mail'];

  beforeAll(async () => {
    const boot = await bootstrapTestApp();
    app = boot.app;
    cleanup = boot.cleanup;
    mail = boot.mail;
  });

  afterAll(async () => {
    await cleanup();
  });

  const http = () => request(app.getHttpServer());

  describe('registro', () => {
    it('cadastra e já devolve accessToken + refreshToken', async () => {
      const res = await http().post('/api/v1/auth/register').send({
        email: 'nova@exemplo.com',
        username: 'nova_conta',
        name: 'Nova Conta',
        password: 'senha-forte',
      });
      expect(res.status).toBe(201);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
      expect(res.body.user).toMatchObject({ email: 'nova@exemplo.com', username: 'nova_conta', roles: [] });
    });

    it('rejeita e-mail duplicado', async () => {
      const res = await http().post('/api/v1/auth/register').send({
        email: 'nova@exemplo.com',
        username: 'outro_username',
        name: 'Duplicado',
        password: 'senha-forte',
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('EMAIL_TAKEN');
    });

    it('rejeita username duplicado', async () => {
      const res = await http().post('/api/v1/auth/register').send({
        email: 'outro@exemplo.com',
        username: 'nova_conta',
        name: 'Duplicado',
        password: 'senha-forte',
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('USERNAME_TAKEN');
    });
  });

  describe('login', () => {
    it('loga por e-mail', async () => {
      const res = await http().post('/api/v1/auth/register').send({
        email: 'login-email@exemplo.com',
        username: 'login_email',
        name: 'Login Email',
        password: 'senha-forte',
      });
      expect(res.status).toBe(201);

      const login = await http().post('/api/v1/auth/login').send({ identifier: 'login-email@exemplo.com', password: 'senha-forte' });
      expect(login.status).toBe(200);
    });

    it('loga por username', async () => {
      const login = await http().post('/api/v1/auth/login').send({ identifier: 'login_email', password: 'senha-forte' });
      expect(login.status).toBe(200);
    });

    it('senha errada -> INVALID_CREDENTIALS', async () => {
      const res = await http().post('/api/v1/auth/login').send({ identifier: 'login_email', password: 'errada' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('/auth/me', () => {
    it('funciona com um access token válido', async () => {
      const login = await http().post('/api/v1/auth/login').send({ identifier: 'login_email', password: 'senha-forte' });
      const res = await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ email: 'login-email@exemplo.com', username: 'login_email' });
    });

    it('token de acesso vencido -> 401 TOKEN_EXPIRED (distinto de token inválido)', async () => {
      const expiredToken = jwt.sign({ sub: 'algum-id', email: 'x@x.com' }, process.env.JWT_SECRET!, { expiresIn: '-10s' });
      const res = await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('TOKEN_EXPIRED');

      const garbage = await http().get('/api/v1/auth/me').set('Authorization', 'Bearer isto-nao-e-um-jwt');
      expect(garbage.status).toBe(401);
      expect(garbage.body.code).toBe('UNAUTHENTICATED');
    });

    it('sem token nenhum -> 401 UNAUTHENTICATED', async () => {
      const res = await http().get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('/auth/refresh — rotação e detecção de reuso', () => {
    it('devolve um par de tokens novo, e o refresh token antigo (rotacionado) não funciona mais', async () => {
      const login = await http().post('/api/v1/auth/login').send({ identifier: 'login_email', password: 'senha-forte' });
      const oldRefresh = login.body.refreshToken;

      const refreshed = await http().post('/api/v1/auth/refresh').send({ refreshToken: oldRefresh });
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.accessToken).toEqual(expect.any(String));
      expect(refreshed.body.refreshToken).not.toBe(oldRefresh);

      const reused = await http().post('/api/v1/auth/refresh').send({ refreshToken: oldRefresh });
      expect(reused.status).toBe(401);
    });

    it('multi-dispositivo: reuso de um token rotacionado revoga TODAS as sessões do usuário, mesmo a de outro dispositivo', async () => {
      const deviceA = await http().post('/api/v1/auth/login').send({ identifier: 'login_email', password: 'senha-forte' });
      const deviceB = await http().post('/api/v1/auth/login').send({ identifier: 'login_email', password: 'senha-forte' });

      // Dispositivo A gira o refresh token uma vez (uso normal).
      const rotatedA = await http().post('/api/v1/auth/refresh').send({ refreshToken: deviceA.body.refreshToken });
      expect(rotatedA.status).toBe(200);

      // Reapresenta o refresh token JÁ rotacionado de A -> sinal de roubo, mata tudo.
      const reuseA = await http().post('/api/v1/auth/refresh').send({ refreshToken: deviceA.body.refreshToken });
      expect(reuseA.status).toBe(401);

      // B nunca foi usado de novo, mas a sessão dele também devia ter sido revogada.
      const refreshB = await http().post('/api/v1/auth/refresh').send({ refreshToken: deviceB.body.refreshToken });
      expect(refreshB.status).toBe(401);
    });

    it('refresh token vencido -> 401', async () => {
      const expiredRefresh = jwt.sign({ sub: 'x', sid: 'y' }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '-10s' });
      const res = await http().post('/api/v1/auth/refresh').send({ refreshToken: expiredRefresh });
      expect(res.status).toBe(401);
    });
  });

  describe('/auth/logout', () => {
    it('revoga a sessão — refresh subsequente com aquele token falha', async () => {
      const login = await http().post('/api/v1/auth/login').send({ identifier: 'login_email', password: 'senha-forte' });

      const out = await http()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ refreshToken: login.body.refreshToken });
      expect(out.status).toBe(200);

      const refreshed = await http().post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken });
      expect(refreshed.status).toBe(401);
    });

    it('é idempotente — chamar de novo não quebra', async () => {
      const login = await http().post('/api/v1/auth/login').send({ identifier: 'login_email', password: 'senha-forte' });
      await http().post('/api/v1/auth/logout').set('Authorization', `Bearer ${login.body.accessToken}`).send({ refreshToken: login.body.refreshToken });
      const again = await http()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ refreshToken: login.body.refreshToken });
      expect(again.status).toBe(200);
    });
  });

  describe('esqueci/redefinir senha', () => {
    it('e-mail existente: manda um token por e-mail (fake mail service em teste)', async () => {
      mail.sent = [];
      const res = await http().post('/api/v1/auth/forgot-password').send({ email: 'login-email@exemplo.com' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(mail.sent).toHaveLength(1);
      expect(mail.sent[0].to).toBe('login-email@exemplo.com');
    });

    it('e-mail inexistente: mesma resposta 200, mas NADA é enviado (anti-enumeração)', async () => {
      mail.sent = [];
      const res = await http().post('/api/v1/auth/forgot-password').send({ email: 'nao-existe@exemplo.com' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(mail.sent).toHaveLength(0);
    });

    it('token válido: troca a senha, permite logar com a nova, e revoga sessões existentes', async () => {
      const beforeLogin = await http().post('/api/v1/auth/login').send({ identifier: 'login_email', password: 'senha-forte' });
      expect(beforeLogin.status).toBe(200);
      const oldRefreshToken = beforeLogin.body.refreshToken;

      mail.sent = [];
      await http().post('/api/v1/auth/forgot-password').send({ email: 'login-email@exemplo.com' });
      const rawToken = mail.sent[0].text.match(/([a-f0-9]{64})/)?.[1];
      expect(rawToken).toBeDefined();

      const reset = await http().post('/api/v1/auth/reset-password').send({ token: rawToken, newPassword: 'senha-nova-123' });
      expect(reset.status).toBe(200);

      const oldPasswordLogin = await http().post('/api/v1/auth/login').send({ identifier: 'login_email', password: 'senha-forte' });
      expect(oldPasswordLogin.status).toBe(401);

      const newPasswordLogin = await http().post('/api/v1/auth/login').send({ identifier: 'login_email', password: 'senha-nova-123' });
      expect(newPasswordLogin.status).toBe(200);

      const staleRefresh = await http().post('/api/v1/auth/refresh').send({ refreshToken: oldRefreshToken });
      expect(staleRefresh.status).toBe(401);
    });

    it('token inválido -> RESET_TOKEN_INVALID', async () => {
      const res = await http().post('/api/v1/auth/reset-password').send({ token: 'token-que-nao-existe', newPassword: 'qualquer-coisa' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('RESET_TOKEN_INVALID');
    });

    it('token já usado -> RESET_TOKEN_INVALID (usedAt setado)', async () => {
      mail.sent = [];
      await http().post('/api/v1/auth/forgot-password').send({ email: 'login-email@exemplo.com' });
      const rawToken = mail.sent[0].text.match(/([a-f0-9]{64})/)?.[1];

      const first = await http().post('/api/v1/auth/reset-password').send({ token: rawToken, newPassword: 'senha-reusada-1' });
      expect(first.status).toBe(200);

      const reused = await http().post('/api/v1/auth/reset-password').send({ token: rawToken, newPassword: 'senha-reusada-2' });
      expect(reused.status).toBe(400);
      expect(reused.body.code).toBe('RESET_TOKEN_INVALID');
    });
  });
});
