import { createTestPrismaClient } from '../../test/prisma-test-client';
import { startTestSshServer, TEST_SSH_PASSWORD, TEST_SSH_USER } from '../../test/ssh-test-server';
import { KnownHostsService } from './known-hosts.service';
import { generateEd25519KeyPair } from './ssh-key.util';
import { ConnectOptions, SshManagerService } from './ssh-manager.service';

const TEST_USER = TEST_SSH_USER;
const TEST_PASSWORD = TEST_SSH_PASSWORD;

function baseHost(port: number, overrides: Partial<{ address: string; port: number; keepalive: boolean }> = {}) {
  return { address: '127.0.0.1', port, username: TEST_USER, keepalive: false, ...overrides };
}

describe('SshManagerService (SSH real, servidor em processo)', () => {
  let prisma: ReturnType<typeof createTestPrismaClient>['prisma'];
  let cleanupPrisma: () => void;
  let knownHosts: KnownHostsService;
  let manager: SshManagerService;
  let ownerId: string;

  beforeAll(() => {
    const t = createTestPrismaClient();
    prisma = t.prisma;
    cleanupPrisma = t.cleanup;
  });

  afterAll(() => cleanupPrisma());

  beforeEach(async () => {
    knownHosts = new KnownHostsService(prisma as never);
    manager = new SshManagerService(knownHosts);
    const user = await prisma.user.create({ data: { email: `${Date.now()}-${Math.random()}@t.com`, name: 'T', passwordHash: 'x' } });
    ownerId = user.id;
  });

  it('testConnection: autentica com senha certa e devolve connected:true', async () => {
    const server = await startTestSshServer();
    try {
      const res = await manager.testConnection(baseHost(server.port), { kind: 'password', password: TEST_PASSWORD });
      expect(res.connected).toBe(true);
    } finally {
      server.stop();
    }
  });

  it('testConnection: senha errada devolve connected:false com mensagem', async () => {
    const server = await startTestSshServer();
    try {
      const res = await manager.testConnection(baseHost(server.port), { kind: 'password', password: 'errada' });
      expect(res.connected).toBe(false);
      expect(res.message).toBeTruthy();
    } finally {
      server.stop();
    }
  });

  it('connect: primeira vez pede TOFU, confia, abre shell e ecoa o que foi digitado', async () => {
    const server = await startTestSshServer();
    try {
      const sessionId = 'sess-1';
      const events: string[] = [];
      let hostKeyInfo: { fingerprint: string; keyType: string } | undefined;
      const dataChunks: Buffer[] = [];

      const opts: ConnectOptions = {
        ownerId,
        host: baseHost(server.port) as never,
        secret: { kind: 'password', password: TEST_PASSWORD },
        cols: 80,
        rows: 24,
        onData: (chunk) => dataChunks.push(chunk),
        onStatus: (state) => events.push(state),
        onHostKeyUnknown: (info) => {
          hostKeyInfo = info;
        },
        onExit: () => events.push('exit'),
      };

      manager.connect(sessionId, opts);
      await waitUntil(() => hostKeyInfo !== undefined);
      expect(hostKeyInfo!.keyType).toBe('ssh-ed25519');

      const trusted = await manager.trustHostKey(sessionId, hostKeyInfo!.fingerprint);
      expect(trusted).toBe(true);

      await waitUntil(() => events.includes('open'));

      const verdict = await knownHosts.verify(ownerId, '127.0.0.1', server.port, 'ssh-ed25519', hostKeyInfo!.fingerprint);
      expect(verdict).toBe('known');

      manager.write(sessionId, Buffer.from('oi\n'));
      await waitUntil(() => Buffer.concat(dataChunks).includes('oi'));

      manager.destroy(sessionId);
    } finally {
      server.stop();
    }
  });

  it('connect: segunda vez no mesmo host não pergunta mais (já confiado) — abre direto', async () => {
    const server = await startTestSshServer();
    try {
      // 1ª conexão descobre e confia no fingerprint de verdade do host de teste.
      const first = 'sess-a';
      let hostKeyInfo: { fingerprint: string } | undefined;
      manager.connect(first, {
        ownerId,
        host: baseHost(server.port) as never,
        secret: { kind: 'password', password: TEST_PASSWORD },
        cols: 80,
        rows: 24,
        onData: () => undefined,
        onStatus: () => undefined,
        onHostKeyUnknown: (info) => {
          hostKeyInfo = info;
        },
        onExit: () => undefined,
      });
      await waitUntil(() => hostKeyInfo !== undefined);
      await manager.trustHostKey(first, hostKeyInfo!.fingerprint);
      manager.destroy(first);

      const second = 'sess-b';
      const events: string[] = [];
      let sawUnknown = false;
      manager.connect(second, {
        ownerId,
        host: baseHost(server.port) as never,
        secret: { kind: 'password', password: TEST_PASSWORD },
        cols: 80,
        rows: 24,
        onData: () => undefined,
        onStatus: (state) => events.push(state),
        onHostKeyUnknown: () => {
          sawUnknown = true;
        },
        onExit: () => undefined,
      });
      await waitUntil(() => events.includes('open'));
      expect(sawUnknown).toBe(false);
      manager.destroy(second);
    } finally {
      server.stop();
    }
  });

  it('connect: chave do host MUDOU — recusa a conexão, nunca chama onHostKeyUnknown', async () => {
    const serverA = await startTestSshServer();
    // "servidor" com outra chave de host no MESMO address:port lógico do teste — TOFU precisa
    // comparar pela linha (ownerId,address,port,keyType), então plantamos um known_host
    // apontando pra um fingerprint que NÃO é o de serverA.
    await knownHosts.trust(ownerId, '127.0.0.1', serverA.port, 'ssh-ed25519', 'SHA256:fingerprint-diferente-de-propósito');
    try {
      const sessionId = 'sess-changed';
      const events: { state: string; message?: string }[] = [];
      let sawUnknown = false;
      manager.connect(sessionId, {
        ownerId,
        host: baseHost(serverA.port) as never,
        secret: { kind: 'password', password: TEST_PASSWORD },
        cols: 80,
        rows: 24,
        onData: () => undefined,
        onStatus: (state, message) => events.push({ state, message }),
        onHostKeyUnknown: () => {
          sawUnknown = true;
        },
        onExit: () => undefined,
      });
      await waitUntil(() => events.some((e) => e.state === 'error'));
      expect(sawUnknown).toBe(false);
      expect(events[0].message).toMatch(/MUDOU/);
    } finally {
      serverA.stop();
    }
  });

  it('connect: autentica com a chave Ed25519 gerada por generateEd25519KeyPair()', async () => {
    const server = await startTestSshServer();
    try {
      const pair = generateEd25519KeyPair();
      const sessionId = 'sess-key';
      const events: string[] = [];
      let hostKeyInfo: { fingerprint: string } | undefined;
      manager.connect(sessionId, {
        ownerId,
        host: baseHost(server.port) as never,
        secret: { kind: 'key', privateKey: pair.privateKeyPem },
        cols: 80,
        rows: 24,
        onData: () => undefined,
        onStatus: (state) => events.push(state),
        onHostKeyUnknown: (info) => {
          hostKeyInfo = info;
        },
        onExit: () => undefined,
      });
      await waitUntil(() => hostKeyInfo !== undefined);
      await manager.trustHostKey(sessionId, hostKeyInfo!.fingerprint);
      await waitUntil(() => events.includes('open'));
      manager.destroy(sessionId);
    } finally {
      server.stop();
    }
  });

  it('replayBuffer: acumula o que foi ecoado e some depois de destroy', async () => {
    const server = await startTestSshServer();
    try {
      const sessionId = 'sess-buffer';
      let hostKeyInfo: { fingerprint: string } | undefined;
      const events: string[] = [];
      manager.connect(sessionId, {
        ownerId,
        host: baseHost(server.port) as never,
        secret: { kind: 'password', password: TEST_PASSWORD },
        cols: 80,
        rows: 24,
        onData: () => undefined,
        onStatus: (state) => events.push(state),
        onHostKeyUnknown: (info) => {
          hostKeyInfo = info;
        },
        onExit: () => undefined,
      });
      await waitUntil(() => hostKeyInfo !== undefined);
      await manager.trustHostKey(sessionId, hostKeyInfo!.fingerprint);
      await waitUntil(() => events.includes('open'));

      manager.write(sessionId, Buffer.from('teste-replay\n'));
      await waitUntil(() => manager.replayBuffer(sessionId).includes('teste-replay'));

      manager.destroy(sessionId);
      expect(manager.isLive(sessionId)).toBe(false);
      expect(manager.replayBuffer(sessionId).length).toBe(0);
    } finally {
      server.stop();
    }
  });
});

async function waitUntil(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitUntil: tempo esgotado esperando a condição.');
    await new Promise((r) => setTimeout(r, 20));
  }
}
