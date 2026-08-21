import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, SshHost } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHostDto, HostResponseDto, UpdateHostDto } from './dto/host.dto';

@Injectable()
export class HostsService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponse(h: SshHost): HostResponseDto {
    return {
      id: h.id,
      label: h.label,
      address: h.address,
      port: h.port,
      username: h.username,
      authMethod: h.authMethod,
      credentialId: h.credentialId,
      groupName: h.groupName,
      tags: (h.tags as string[] | null) ?? [],
      color: h.color,
      keepalive: h.keepalive,
      startupCommand: h.startupCommand,
      lastConnectedAt: h.lastConnectedAt,
    };
  }

  list(ownerId: string): Promise<HostResponseDto[]> {
    return this.prisma.sshHost
      .findMany({ where: { ownerId }, orderBy: { createdAt: 'asc' } })
      .then((rows) => rows.map((r) => this.toResponse(r)));
  }

  async findOne(id: string, ownerId: string): Promise<HostResponseDto> {
    const h = await this.findOwned(id, ownerId);
    return this.toResponse(h);
  }

  // Uso interno (gateway/SshManagerService) — nunca sai direto pra um controller/resposta HTTP.
  async findOwned(id: string, ownerId: string): Promise<SshHost> {
    const h = await this.prisma.sshHost.findFirst({ where: { id, ownerId } });
    if (!h) throw new NotFoundException({ message: 'Host não encontrado.', code: 'SSH_HOST_NOT_FOUND' });
    return h;
  }

  async create(ownerId: string, dto: CreateHostDto): Promise<HostResponseDto> {
    const h = await this.prisma.sshHost.create({
      data: {
        label: dto.label,
        address: dto.address,
        port: dto.port ?? 22,
        username: dto.username,
        authMethod: dto.authMethod,
        credentialId: dto.credentialId,
        groupName: dto.groupName,
        tags: (dto.tags ?? []) as Prisma.InputJsonValue,
        color: dto.color ?? '#8E8E93',
        keepalive: dto.keepalive ?? true,
        startupCommand: dto.startupCommand,
        ownerId,
      },
    });
    return this.toResponse(h);
  }

  async update(id: string, ownerId: string, dto: UpdateHostDto): Promise<HostResponseDto> {
    await this.findOwned(id, ownerId);
    const h = await this.prisma.sshHost.update({
      where: { id },
      data: {
        label: dto.label,
        address: dto.address,
        port: dto.port,
        username: dto.username,
        authMethod: dto.authMethod,
        credentialId: dto.credentialId,
        groupName: dto.groupName,
        tags: dto.tags ? (dto.tags as Prisma.InputJsonValue) : undefined,
        color: dto.color,
        keepalive: dto.keepalive,
        startupCommand: dto.startupCommand,
      },
    });
    return this.toResponse(h);
  }

  async remove(id: string, ownerId: string): Promise<void> {
    await this.findOwned(id, ownerId);
    await this.prisma.sshHost.delete({ where: { id } });
  }

  async touchLastConnected(id: string): Promise<void> {
    await this.prisma.sshHost.update({ where: { id }, data: { lastConnectedAt: new Date() } });
  }
}
