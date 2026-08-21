import { Injectable, NotFoundException } from '@nestjs/common';
import type { Connection, Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { decrypt, encrypt, PASSWORD_MASK } from '../common/crypto.util';
import { ConnectionResponseDto, CreateConnectionDto, UpdateConnectionDto } from './dto/connection.dto';
import { KnexPoolService, StoredConnectionConfig } from './knex-pool.service';

function withEncryptedPassword(config: Record<string, unknown>): Record<string, unknown> {
  const connection = (config.connection as Record<string, unknown> | undefined) ?? {};
  if (typeof connection.password === 'string' && connection.password && !connection.password.startsWith('enc:')) {
    connection.password = encrypt(connection.password);
  }
  return { ...config, connection };
}

function masked(config: Record<string, unknown>): Record<string, unknown> {
  const connection = { ...((config.connection as Record<string, unknown> | undefined) ?? {}) };
  if (typeof connection.password === 'string' && connection.password) connection.password = PASSWORD_MASK;
  return { ...config, connection };
}

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pool: KnexPoolService
  ) {}

  private toResponse(c: Connection): ConnectionResponseDto {
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      client: c.client,
      config: masked(c.config as Record<string, unknown>),
      readOnly: c.readOnly,
      connected: this.pool.isConnected(c.id),
    };
  }

  list(ownerId: string): Promise<ConnectionResponseDto[]> {
    return this.prisma.connection
      .findMany({ where: { ownerId }, orderBy: { createdAt: 'asc' } })
      .then((rows) => rows.map((r) => this.toResponse(r)));
  }

  async findOne(id: string, ownerId: string): Promise<ConnectionResponseDto> {
    const c = await this.findOwned(id, ownerId);
    return this.toResponse(c);
  }

  // Só pra uso INTERNO (KnexPoolService/catálogo) — senha decifrada, nunca sai da camada de
  // serviço em direção a um controller/resposta HTTP.
  async findOwned(id: string, ownerId: string): Promise<Connection> {
    const c = await this.prisma.connection.findFirst({ where: { id, ownerId } });
    if (!c) throw new NotFoundException({ message: 'Conexão não encontrada.', code: 'CONNECTION_NOT_FOUND' });
    return c;
  }

  async decryptedConfig(id: string, ownerId: string): Promise<StoredConnectionConfig> {
    const c = await this.findOwned(id, ownerId);
    return this.decrypt(c.config as Record<string, unknown>);
  }

  private decrypt(config: Record<string, unknown>): StoredConnectionConfig {
    const connection = { ...((config.connection as Record<string, unknown> | undefined) ?? {}) };
    if (typeof connection.password === 'string' && connection.password) connection.password = decrypt(connection.password);
    return { ...config, connection } as StoredConnectionConfig;
  }

  async create(ownerId: string, dto: CreateConnectionDto): Promise<ConnectionResponseDto> {
    const c = await this.prisma.connection.create({
      data: {
        name: dto.name,
        color: dto.color ?? '#8E8E93',
        client: dto.client,
        config: withEncryptedPassword(dto.config) as Prisma.InputJsonValue,
        readOnly: dto.readOnly ?? false,
        ownerId,
      },
    });
    return this.toResponse(c);
  }

  async update(id: string, ownerId: string, dto: UpdateConnectionDto): Promise<ConnectionResponseDto> {
    await this.findOwned(id, ownerId);
    const c = await this.prisma.connection.update({
      where: { id },
      data: {
        name: dto.name,
        color: dto.color,
        client: dto.client,
        config: dto.config ? (withEncryptedPassword(dto.config) as Prisma.InputJsonValue) : undefined,
        readOnly: dto.readOnly,
      },
    });
    return this.toResponse(c);
  }

  async remove(id: string, ownerId: string): Promise<void> {
    await this.findOwned(id, ownerId);
    await this.pool.destroy(id);
    await this.prisma.connection.delete({ where: { id } });
  }
}
