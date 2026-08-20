import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { CaslAbilityFactory, type AppAbility } from './casl-ability.factory';
import { CHECK_ABILITY_KEY, type RequiredRule } from './check-ability.decorator';

const ROLES_INCLUDE = { roles: { include: { role: { include: { permissions: true } } } } } as const;

export interface RequestWithAbility extends Request {
  user: { id: string; email: string };
  ability: AppAbility;
}

// Roda DEPOIS de JwtAuthGuard (req.user já populado pelo JwtStrategy). Busca o usuário com
// roles+permissions direto do Prisma (não via UsersService — evitaria um módulo circular entre
// users/ e permissions/) e monta a Ability a cada request, sem cache: revogar uma role tem
// efeito imediato.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly caslFactory: CaslAbilityFactory
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<RequiredRule | undefined>(CHECK_ABILITY_KEY, context.getHandler());
    const req = context.switchToHttp().getRequest<RequestWithAbility>();

    const user = await this.prisma.user.findUnique({ where: { id: req.user.id }, include: ROLES_INCLUDE });
    if (!user || !user.active) {
      throw new ForbiddenException({ message: 'Usuário inativo ou não encontrado.', code: 'USER_INACTIVE' });
    }

    const ability = this.caslFactory.createForUser(user);
    req.ability = ability;

    if (!required) return true; // rota sem @CheckAbility: só precisa estar autenticado e ativo
    if (!ability.can(required.action, required.subject)) {
      throw new ForbiddenException({
        message: `Sem permissão para "${required.action}" em "${required.subject}".`,
        code: 'FORBIDDEN',
      });
    }
    return true;
  }
}
