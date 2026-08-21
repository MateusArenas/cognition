import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { bootstrapTestApp } from './bootstrap-app';
import { seedAdminUser, ADMIN_PASSWORD } from './seed-auth';
import { startTestSshServer, TEST_SSH_PASSWORD, TEST_SSH_USER } from './ssh-test-server';

// Ponta a ponta de verdade: login → gerar/importar credencial → criar host → CRUD → TOFU
// (desconhecido → confia → conhecido) → abrir sessão de terminal pelo gateway /ssh → digitar e
// receber eco → reconectar (session:attach) com replay → fechar. O "host remoto" é um servidor
// SSH real rodando em processo (test/ssh-test-server.ts), não um mock de ssh2 — a única coisa
// que não é produção de verdade aqui é não ter uma VPS de verdade do outro lado.
describe('SSH (e2e)', () => {
  let app: INestApplication;
  let cleanup: () => Promise<void>;
  let baseUrl: string;
  let token: string;
  let sshServer: { port: number; stop: () => void };

  beforeAll(async () => {
    const boot = await bootstrapTestApp();
    app = boot.app;
    cleanup = boot.cleanup;
    await seedAdminUser(boot.prisma);

    // socket.io precisa de uma porta TCP de verdade — supertest injeta requisições sem escutar,
    // mas o gateway não existe sem isso. `app.getHttpServer()` continua funcionando pro
    // supertest depois do listen() (mesmo servidor).
    await app.listen(0);
    baseUrl = await app.getUrl();

    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: 'admin@exemplo.com', password: ADMIN_PASSWORD });
    expect(login.status).toBe(200);
    token = login.body.accessToken;

    sshServer = await startTestSshServer();
  });

  afterAll(async () => {
    sshServer.stop();
    await cleanup();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('rejeita rota SSH sem token', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/ssh/hosts');
    expect(res.status).toBe(401);
  });

  let credentialId: string;

  it('gera uma credencial Ed25519 nova (chave privada nunca volta na resposta)', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/ssh/credentials/generate').set(auth()).send({ name: 'chave-e2e' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.publicKey).toMatch(/^ssh-ed25519 /);
    expect(res.body.fingerprintSha256).toMatch(/^SHA256:/);
    expect(res.body.secretCiphertext).toBeUndefined();
    expect(res.body.privateKey).toBeUndefined();
  });

  it('importa uma credencial de senha', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ssh/credentials')
      .set(auth())
      .send({ name: 'senha-e2e', kind: 'password', password: TEST_SSH_PASSWORD });
    expect(res.status).toBe(201);
    credentialId = res.body.id;
    expect(res.body.kind).toBe('password');
  });

  let hostId: string;

  it('cria o host apontando pro servidor SSH de teste', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ssh/hosts')
      .set(auth())
      .send({
        label: 'Host de teste',
        address: '127.0.0.1',
        port: sshServer.port,
        username: TEST_SSH_USER,
        authMethod: 'password',
        credentialId,
        tags: ['e2e'],
      });
    expect(res.status).toBe(201);
    hostId = res.body.id;
    expect(res.body.tags).toEqual(['e2e']);
  });

  it('lista o host criado', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/ssh/hosts').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.find((h: { id: string }) => h.id === hostId)).toBeDefined();
  });

  it('POST /ssh/hosts/:id/test autentica de verdade contra o servidor de teste', async () => {
    const res = await request(app.getHttpServer()).post(`/api/v1/ssh/hosts/${hostId}/test`).set(auth());
    expect(res.status).toBe(201);
    expect(res.body.connected).toBe(true);
  });

  it('PATCH credencial: renomeia sem mexer no segredo — host continua conectando', async () => {
    const res = await request(app.getHttpServer()).patch(`/api/v1/ssh/credentials/${credentialId}`).set(auth()).send({ name: 'senha-e2e-renomeada' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('senha-e2e-renomeada');

    const test = await request(app.getHttpServer()).post(`/api/v1/ssh/hosts/${hostId}/test`).set(auth());
    expect(test.body.connected).toBe(true);
  });

  it('PATCH credencial: troca a senha de verdade — o host autentica com a nova, não mais com a antiga', async () => {
    const wrong = await request(app.getHttpServer()).patch(`/api/v1/ssh/credentials/${credentialId}`).set(auth()).send({ password: 'senha-errada' });
    expect(wrong.status).toBe(200);

    const failed = await request(app.getHttpServer()).post(`/api/v1/ssh/hosts/${hostId}/test`).set(auth());
    expect(failed.body.connected).toBe(false);

    // restaura a senha certa — os testes seguintes (renomear host, sessão do gateway) dependem dela
    await request(app.getHttpServer()).patch(`/api/v1/ssh/credentials/${credentialId}`).set(auth()).send({ password: TEST_SSH_PASSWORD });
    const restored = await request(app.getHttpServer()).post(`/api/v1/ssh/hosts/${hostId}/test`).set(auth());
    expect(restored.body.connected).toBe(true);
  });

  it('atualiza o host (renomeia)', async () => {
    const res = await request(app.getHttpServer()).patch(`/api/v1/ssh/hosts/${hostId}`).set(auth()).send({ label: 'Host renomeado' });
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Host renomeado');
  });

  it('snippets: cria, lista e apaga', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/v1/ssh/snippets')
      .set(auth())
      .send({ name: 'Espaço em disco', command: 'df -h' });
    expect(create.status).toBe(201);

    const list = await request(app.getHttpServer()).get('/api/v1/ssh/snippets').set(auth());
    expect(list.body.length).toBe(1);
    expect(list.body[0].requireConfirm).toBe(true); // default ligado, nunca roda sem confirmar

    const del = await request(app.getHttpServer()).delete(`/api/v1/ssh/snippets/${create.body.id}`).set(auth());
    expect(del.status).toBe(200);
  });

  // --- gateway /ssh: sessão de terminal de verdade -------------------------------------------

  let socket: Socket;
  let sessionId: string;

  afterAll(() => {
    socket?.close();
  });

  it('gateway: session:open pede confiança na chave do host (TOFU, primeira vez)', async () => {
    socket = io(`${baseUrl}/ssh`, { auth: { token }, transports: ['websocket'], forceNew: true });
    await waitFor(socket, 'connect');

    const hostKeyUnknown = waitFor<{ sessionId: string; fingerprint: string; keyType: string }>(socket, 'hostkey:unknown');
    const ack = await socket.timeout(5000).emitWithAck('session:open', { hostId, cols: 80, rows: 24 });
    expect(ack).not.toHaveProperty('error');
    sessionId = (ack as { sessionId: string }).sessionId;

    const info = await hostKeyUnknown;
    expect(info.sessionId).toBe(sessionId);
    expect(info.keyType).toBe('ssh-ed25519');

    const trustAck = await socket.timeout(5000).emitWithAck('hostkey:trust', { sessionId, fingerprint: info.fingerprint });
    expect(trustAck.trusted).toBe(true);
  });

  it('gateway: abre o shell, digita e recebe o eco pelo evento data', async () => {
    const opened = waitForWhere<{ sessionId: string; state: string }>(socket, 'status', (p) => p.state === 'open');
    await opened;

    const echoed = waitForWhere<{ sessionId: string; b64: string }>(socket, 'data', (p) => Buffer.from(p.b64, 'base64').toString('utf8').includes('ping-e2e'));
    socket.emit('data', { sessionId, b64: Buffer.from('ping-e2e\n').toString('base64') });
    await echoed;
  });

  it('gateway: session:close encerra e o REST reflete status fechado', async () => {
    await socket.timeout(5000).emitWithAck('session:close', { sessionId });
    const res = await request(app.getHttpServer()).get('/api/v1/ssh/sessions').set(auth());
    expect(res.body.find((s: { id: string }) => s.id === sessionId)).toBeUndefined();
  });

  it('gateway: reconectar e abrir uma sessão nova funciona de novo (host já confiado, sem TOFU)', async () => {
    const socket2 = io(`${baseUrl}/ssh`, { auth: { token }, transports: ['websocket'], forceNew: true });
    try {
      await waitFor(socket2, 'connect');
      let sawUnknown = false;
      socket2.on('hostkey:unknown', () => {
        sawUnknown = true;
      });
      const ack = await socket2.timeout(5000).emitWithAck('session:open', { hostId, cols: 80, rows: 24 });
      const newSessionId = (ack as { sessionId: string }).sessionId;
      await waitForWhere<{ state: string }>(socket2, 'status', (p) => p.state === 'open');
      expect(sawUnknown).toBe(false);
      await socket2.timeout(5000).emitWithAck('session:close', { sessionId: newSessionId });
    } finally {
      socket2.close();
    }
  });

  it('gateway: token inválido é recusado no handshake', async () => {
    const bad = io(`${baseUrl}/ssh`, { auth: { token: 'lixo' }, transports: ['websocket'], forceNew: true });
    try {
      const status = await waitFor<{ state: string; code: string }>(bad, 'status');
      expect(status.state).toBe('error');
      expect(status.code).toBe('UNAUTHENTICATED');
    } finally {
      bad.close();
    }
  });

  it('apaga o host (limpeza)', async () => {
    const res = await request(app.getHttpServer()).delete(`/api/v1/ssh/hosts/${hostId}`).set(auth());
    expect(res.status).toBe(200);
  });
});

function waitFor<T = unknown>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`waitFor("${event}"): tempo esgotado`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function waitForWhere<T = unknown>(socket: Socket, event: string, predicate: (payload: T) => boolean, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`waitForWhere("${event}"): tempo esgotado`)), timeoutMs);
    const handler = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}
