import { Injectable, NotFoundException } from '@nestjs/common';
import type { SshSnippet } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSnippetDto, SnippetResponseDto, UpdateSnippetDto } from './dto/snippet.dto';

@Injectable()
export class SnippetsService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponse(s: SshSnippet): SnippetResponseDto {
    return { id: s.id, name: s.name, command: s.command, tag: s.tag, requireConfirm: s.requireConfirm };
  }

  list(ownerId: string): Promise<SnippetResponseDto[]> {
    return this.prisma.sshSnippet
      .findMany({ where: { ownerId }, orderBy: { createdAt: 'asc' } })
      .then((rows) => rows.map((r) => this.toResponse(r)));
  }

  async findOwned(id: string, ownerId: string): Promise<SshSnippet> {
    const s = await this.prisma.sshSnippet.findFirst({ where: { id, ownerId } });
    if (!s) throw new NotFoundException({ message: 'Snippet não encontrado.', code: 'SSH_SNIPPET_NOT_FOUND' });
    return s;
  }

  async create(ownerId: string, dto: CreateSnippetDto): Promise<SnippetResponseDto> {
    const s = await this.prisma.sshSnippet.create({
      data: { ownerId, name: dto.name, command: dto.command, tag: dto.tag, requireConfirm: dto.requireConfirm ?? true },
    });
    return this.toResponse(s);
  }

  async update(id: string, ownerId: string, dto: UpdateSnippetDto): Promise<SnippetResponseDto> {
    await this.findOwned(id, ownerId);
    const s = await this.prisma.sshSnippet.update({
      where: { id },
      data: { name: dto.name, command: dto.command, tag: dto.tag, requireConfirm: dto.requireConfirm },
    });
    return this.toResponse(s);
  }

  async remove(id: string, ownerId: string): Promise<void> {
    await this.findOwned(id, ownerId);
    await this.prisma.sshSnippet.delete({ where: { id } });
  }
}
