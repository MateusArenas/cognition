import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

const ROLES_INCLUDE = { roles: { include: { role: { include: { permissions: true } } } } } as const;

// Tipo devolvido pelas duas consultas acima — é o que CaslAbilityFactory.createForUser espera
// (backend/src/permissions/casl-ability.factory.ts).
export type UserWithRoles = Awaited<ReturnType<UsersService['findByEmailWithRoles']>>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmailWithRoles(email: string) {
    return this.prisma.user.findUnique({ where: { email }, include: ROLES_INCLUDE });
  }

  // Login aceita e-mail OU username — usado só por AuthService.login, nunca pelo resto do app
  // (as outras telas continuam identificando usuário por id/email).
  findByIdentifierWithRoles(identifier: string) {
    return this.prisma.user.findFirst({ where: { OR: [{ email: identifier }, { username: identifier }] }, include: ROLES_INCLUDE });
  }

  findByIdWithRoles(id: string) {
    return this.prisma.user.findUnique({ where: { id }, include: ROLES_INCLUDE });
  }

  async list(): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({ include: ROLES_INCLUDE, orderBy: { createdAt: 'asc' } });
    return users.map(toResponse);
  }

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException({ message: 'Já existe um usuário com este e-mail.', code: 'EMAIL_TAKEN' });

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        roles: dto.roles?.length
          ? { create: dto.roles.map((name) => ({ role: { connect: { name } } })) }
          : undefined,
      },
      include: ROLES_INCLUDE,
    });
    return toResponse(user);
  }

  async setRoles(userId: string, roleNames: string[]): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException({ message: 'Usuário não encontrado.', code: 'USER_NOT_FOUND' });

    await this.prisma.userRole.deleteMany({ where: { userId } });
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { roles: { create: roleNames.map((name) => ({ role: { connect: { name } } })) } },
      include: ROLES_INCLUDE,
    });
    return toResponse(updated);
  }
}

function toResponse(user: NonNullable<UserWithRoles>): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    active: user.active,
    roles: user.roles.map((r) => r.role.name),
  };
}
