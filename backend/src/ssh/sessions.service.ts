import { Injectable, NotFoundException } from '@nestjs/common';
import type { SshSession } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

// A linha Prisma é o que a tela "Sessões" do app lê; o processo ssh2 vivo de verdade é o Map em
// memória do SshManagerService (ssh.gateway.ts) — os dois ficam em sincronia via setStatus().
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  list(ownerId: string) {
    return this.prisma.sshSession.findMany({
      where: { ownerId, status: { in: ['connecting', 'open', 'detached'] } },
      orderBy: { openedAt: 'desc' },
    });
  }

  async findOwned(id: string, ownerId: string): Promise<SshSession> {
    const s = await this.prisma.sshSession.findFirst({ where: { id, ownerId } });
    if (!s) throw new NotFoundException({ message: 'Sessão não encontrada.', code: 'SSH_SESSION_NOT_FOUND' });
    return s;
  }

  create(ownerId: string, hostId: string | undefined, cols: number, rows: number) {
    return this.prisma.sshSession.create({ data: { ownerId, hostId, cols, rows, status: 'connecting' } });
  }

  setStatus(id: string, status: string, errorMessage?: string) {
    return this.prisma.sshSession.update({ where: { id }, data: { status, errorMessage } });
  }

  resize(id: string, cols: number, rows: number) {
    return this.prisma.sshSession.update({ where: { id }, data: { cols, rows } });
  }

  close(id: string) {
    return this.prisma.sshSession.update({ where: { id }, data: { status: 'closed', closedAt: new Date() } });
  }
}
