import { Injectable, NotFoundException } from '@nestjs/common';
import { decrypt, encrypt } from '../common/crypto.util';
import type { SshCredential } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialResponseDto, GenerateCredentialDto, ImportCredentialDto, UpdateCredentialDto } from './dto/credential.dto';
import { fingerprintFromOpenSshLine, generateEd25519KeyPair } from './ssh-key.util';

export type DecryptedSecret = { kind: 'key'; privateKey: string; passphrase?: string } | { kind: 'password'; password: string };

function keyTypeOf(publicKeyLine: string | undefined): string | undefined {
  if (!publicKeyLine) return undefined;
  if (publicKeyLine.startsWith('ssh-ed25519')) return 'ed25519';
  if (publicKeyLine.startsWith('ssh-rsa')) return 'rsa';
  if (publicKeyLine.startsWith('ecdsa-')) return 'ecdsa';
  return undefined;
}

@Injectable()
export class CredentialsService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponse(c: SshCredential): CredentialResponseDto {
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      keyType: c.keyType,
      publicKey: c.publicKey,
      fingerprintSha256: c.fingerprintSha256,
      hasPassphrase: c.hasPassphrase,
    };
  }

  list(ownerId: string): Promise<CredentialResponseDto[]> {
    return this.prisma.sshCredential
      .findMany({ where: { ownerId }, orderBy: { createdAt: 'asc' } })
      .then((rows) => rows.map((r) => this.toResponse(r)));
  }

  async findOwned(id: string, ownerId: string): Promise<SshCredential> {
    const c = await this.prisma.sshCredential.findFirst({ where: { id, ownerId } });
    if (!c) throw new NotFoundException({ message: 'Credencial não encontrada.', code: 'SSH_CREDENTIAL_NOT_FOUND' });
    return c;
  }

  // Uso interno (SshManagerService) — nunca sai pra um controller/resposta HTTP.
  async decryptedSecret(id: string, ownerId: string): Promise<DecryptedSecret> {
    const c = await this.findOwned(id, ownerId);
    if (c.kind === 'key') {
      const parsed = JSON.parse(decrypt(c.secretCiphertext)) as { privateKey: string; passphrase?: string };
      return { kind: 'key', privateKey: parsed.privateKey, passphrase: parsed.passphrase };
    }
    return { kind: 'password', password: decrypt(c.secretCiphertext) };
  }

  async import(ownerId: string, dto: ImportCredentialDto): Promise<CredentialResponseDto> {
    const secretCiphertext =
      dto.kind === 'key'
        ? encrypt(JSON.stringify({ privateKey: dto.privateKey, passphrase: dto.passphrase }))
        : encrypt(dto.password!);

    const c = await this.prisma.sshCredential.create({
      data: {
        ownerId,
        name: dto.name,
        kind: dto.kind,
        keyType: dto.kind === 'key' ? keyTypeOf(dto.publicKey) : null,
        publicKey: dto.kind === 'key' ? (dto.publicKey ?? null) : null,
        fingerprintSha256: dto.kind === 'key' && dto.publicKey ? fingerprintFromOpenSshLine(dto.publicKey) : null,
        hasPassphrase: dto.kind === 'key' && !!dto.passphrase,
        secretCiphertext,
      },
    });
    return this.toResponse(c);
  }

  async generate(ownerId: string, dto: GenerateCredentialDto): Promise<CredentialResponseDto> {
    const pair = generateEd25519KeyPair();
    const c = await this.prisma.sshCredential.create({
      data: {
        ownerId,
        name: dto.name,
        kind: 'key',
        keyType: 'ed25519',
        publicKey: pair.publicKeyOpenSsh,
        fingerprintSha256: pair.fingerprintSha256,
        hasPassphrase: false,
        secretCiphertext: encrypt(JSON.stringify({ privateKey: pair.privateKeyPem })),
      },
    });
    return this.toResponse(c);
  }

  // `kind` nunca muda — só nome, chave pública e o segredo em si (privateKey/passphrase ou
  // password), e só recifra o que veio preenchido; em branco mantém o que já tem (mesmo
  // princípio de "senha em branco = não muda" de outras telas do app).
  async update(id: string, ownerId: string, dto: UpdateCredentialDto): Promise<CredentialResponseDto> {
    const existing = await this.findOwned(id, ownerId);
    let secretCiphertext: string | undefined;

    const changingPrivateKey = existing.kind === 'key' && !!dto.privateKey;
    const changingPassphrase = existing.kind === 'key' && dto.passphrase !== undefined && dto.passphrase !== '';
    if (changingPrivateKey) {
      // Chave nova substitui a antiga por inteiro — a passphrase da chave anterior não se aplica
      // a um arquivo diferente, então só entra se vier explicitamente junto com a chave nova.
      secretCiphertext = encrypt(JSON.stringify({ privateKey: dto.privateKey, passphrase: dto.passphrase || undefined }));
    } else if (changingPassphrase) {
      const current = JSON.parse(decrypt(existing.secretCiphertext)) as { privateKey: string; passphrase?: string };
      secretCiphertext = encrypt(JSON.stringify({ privateKey: current.privateKey, passphrase: dto.passphrase }));
    } else if (existing.kind === 'password' && dto.password) {
      secretCiphertext = encrypt(dto.password);
    }

    const publicKey = dto.publicKey || existing.publicKey || undefined;
    const c = await this.prisma.sshCredential.update({
      where: { id },
      data: {
        name: dto.name,
        secretCiphertext,
        publicKey: dto.publicKey !== undefined ? dto.publicKey || null : undefined,
        keyType: existing.kind === 'key' && dto.publicKey !== undefined ? (keyTypeOf(publicKey) ?? null) : undefined,
        fingerprintSha256: existing.kind === 'key' && dto.publicKey !== undefined ? (publicKey ? fingerprintFromOpenSshLine(publicKey) : null) : undefined,
        hasPassphrase: changingPrivateKey || changingPassphrase ? !!dto.passphrase : undefined,
      },
    });
    return this.toResponse(c);
  }

  async remove(id: string, ownerId: string): Promise<void> {
    await this.findOwned(id, ownerId);
    await this.prisma.sshCredential.delete({ where: { id } });
  }
}
