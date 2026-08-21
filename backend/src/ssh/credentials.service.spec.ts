import { createTestPrismaClient } from '../../test/prisma-test-client';
import { CredentialsService } from './credentials.service';
import { generateEd25519KeyPair } from './ssh-key.util';

describe('CredentialsService — editar sem perder o que não foi tocado', () => {
  let prisma: ReturnType<typeof createTestPrismaClient>['prisma'];
  let cleanup: () => void;
  let service: CredentialsService;
  let ownerId: string;

  beforeAll(() => {
    process.env.APP_SECRET ??= 'segredo-de-teste';
    const t = createTestPrismaClient();
    prisma = t.prisma;
    cleanup = t.cleanup;
  });

  afterAll(() => cleanup());

  beforeEach(async () => {
    service = new CredentialsService(prisma as never);
    const user = await prisma.user.create({ data: { email: `${Date.now()}-${Math.random()}@t.com`, name: 'T', passwordHash: 'x' } });
    ownerId = user.id;
  });

  it('kind "key": renomear não mexe na chave privada nem na passphrase', async () => {
    const c = await service.import(ownerId, { name: 'original', kind: 'key', privateKey: 'PEM-A', passphrase: 'senha-a' });
    await service.update(c.id, ownerId, { name: 'renomeada' });

    const secret = await service.decryptedSecret(c.id, ownerId);
    expect(secret).toEqual({ kind: 'key', privateKey: 'PEM-A', passphrase: 'senha-a' });
    const row = await service.findOwned(c.id, ownerId);
    expect(row.name).toBe('renomeada');
    expect(row.hasPassphrase).toBe(true);
  });

  it('kind "key": trocar só a passphrase mantém a chave privada', async () => {
    const c = await service.import(ownerId, { name: 'x', kind: 'key', privateKey: 'PEM-A', passphrase: 'senha-a' });
    await service.update(c.id, ownerId, { passphrase: 'senha-nova' });

    const secret = await service.decryptedSecret(c.id, ownerId);
    expect(secret).toEqual({ kind: 'key', privateKey: 'PEM-A', passphrase: 'senha-nova' });
  });

  it('kind "key": colar uma chave nova sem passphrase reseta a passphrase antiga (não se aplica a outro arquivo)', async () => {
    const c = await service.import(ownerId, { name: 'x', kind: 'key', privateKey: 'PEM-A', passphrase: 'senha-a' });
    const updated = await service.update(c.id, ownerId, { privateKey: 'PEM-B' });

    const secret = await service.decryptedSecret(c.id, ownerId);
    expect(secret).toEqual({ kind: 'key', privateKey: 'PEM-B', passphrase: undefined });
    expect(updated.hasPassphrase).toBe(false);
  });

  it('kind "key": trocar a chave E mandar passphrase nova junto aplica as duas', async () => {
    const c = await service.import(ownerId, { name: 'x', kind: 'key', privateKey: 'PEM-A' });
    const updated = await service.update(c.id, ownerId, { privateKey: 'PEM-B', passphrase: 'nova' });

    const secret = await service.decryptedSecret(c.id, ownerId);
    expect(secret).toEqual({ kind: 'key', privateKey: 'PEM-B', passphrase: 'nova' });
    expect(updated.hasPassphrase).toBe(true);
  });

  it('kind "key": trocar a chave pública recalcula fingerprint e keyType', async () => {
    const c = await service.import(ownerId, { name: 'x', kind: 'key', privateKey: 'PEM-A' });
    const pair = generateEd25519KeyPair();
    const updated = await service.update(c.id, ownerId, { publicKey: `${pair.publicKeyOpenSsh} comentario` });

    expect(updated.fingerprintSha256).toBe(pair.fingerprintSha256);
    expect(updated.keyType).toBe('ed25519');
  });

  it('kind "password": trocar a senha muda o segredo; renomear sozinho não muda', async () => {
    const c = await service.import(ownerId, { name: 'x', kind: 'password', password: 'senha-a' });

    await service.update(c.id, ownerId, { name: 'y' });
    expect(await service.decryptedSecret(c.id, ownerId)).toEqual({ kind: 'password', password: 'senha-a' });

    await service.update(c.id, ownerId, { password: 'senha-b' });
    expect(await service.decryptedSecret(c.id, ownerId)).toEqual({ kind: 'password', password: 'senha-b' });
  });

  it('mandar password vazio pra uma credencial "password" não muda o segredo (em branco = mantém)', async () => {
    const c = await service.import(ownerId, { name: 'x', kind: 'password', password: 'senha-a' });
    await service.update(c.id, ownerId, { password: '' });
    expect(await service.decryptedSecret(c.id, ownerId)).toEqual({ kind: 'password', password: 'senha-a' });
  });
});
