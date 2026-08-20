import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AddPermissionDto, CreateRoleDto } from './dto/role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.role.findMany({ include: { permissions: true }, orderBy: { name: 'asc' } });
  }

  async create(dto: CreateRoleDto) {
    const existing = await this.prisma.role.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException({ message: 'Já existe uma role com este nome.', code: 'ROLE_TAKEN' });
    return this.prisma.role.create({ data: { name: dto.name, description: dto.description }, include: { permissions: true } });
  }

  async addPermission(roleId: string, dto: AddPermissionDto) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException({ message: 'Role não encontrada.', code: 'ROLE_NOT_FOUND' });
    return this.prisma.permission.create({
      data: {
        roleId,
        action: dto.action,
        subject: dto.subject,
        inverted: dto.inverted ?? false,
        conditions: dto.conditions as Prisma.InputJsonValue | undefined,
        reason: dto.reason,
      },
    });
  }

  async removePermission(permissionId: string) {
    const perm = await this.prisma.permission.findUnique({ where: { id: permissionId } });
    if (!perm) throw new NotFoundException({ message: 'Permissão não encontrada.', code: 'PERMISSION_NOT_FOUND' });
    await this.prisma.permission.delete({ where: { id: permissionId } });
  }
}
