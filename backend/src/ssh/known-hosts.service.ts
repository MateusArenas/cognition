import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type TofuVerdict = 'known' | 'unknown' | 'changed';

// TOFU (trust-on-first-use): primeira conexão com um host mostra a impressão digital e pergunta;
// da segunda em diante, compara. Chave que muda é bloqueada (sinal clássico de MITM) — reconfiar
// exige um `trust()` explícito do usuário depois de ver o alerta vermelho, nunca automático.
@Injectable()
export class KnownHostsService {
  constructor(private readonly prisma: PrismaService) {}

  list(ownerId: string) {
    return this.prisma.sshKnownHost.findMany({ where: { ownerId }, orderBy: { trustedAt: 'desc' } });
  }

  async verify(ownerId: string, address: string, port: number, keyType: string, fingerprintSha256: string): Promise<TofuVerdict> {
    const row = await this.prisma.sshKnownHost.findUnique({
      where: { ownerId_address_port_keyType: { ownerId, address, port, keyType } },
    });
    if (!row) return 'unknown';
    return row.fingerprintSha256 === fingerprintSha256 ? 'known' : 'changed';
  }

  async trust(ownerId: string, address: string, port: number, keyType: string, fingerprintSha256: string): Promise<void> {
    await this.prisma.sshKnownHost.upsert({
      where: { ownerId_address_port_keyType: { ownerId, address, port, keyType } },
      create: { ownerId, address, port, keyType, fingerprintSha256 },
      update: { fingerprintSha256, trustedAt: new Date() },
    });
  }

  async remove(id: string, ownerId: string): Promise<void> {
    const row = await this.prisma.sshKnownHost.findFirst({ where: { id, ownerId } });
    if (!row) throw new NotFoundException({ message: 'Chave de host não encontrada.', code: 'SSH_KNOWN_HOST_NOT_FOUND' });
    await this.prisma.sshKnownHost.delete({ where: { id } });
  }
}
