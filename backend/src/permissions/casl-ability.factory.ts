import { Injectable } from '@nestjs/common';
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import type { UserWithRoles } from '../users/users.service';

// Ações e sujeitos fechados de propósito — cada rota nova que precisar de uma checagem granular
// entra aqui, não como string solta espalhada pelos controllers.
export type Action = 'manage' | 'create' | 'read' | 'update' | 'delete';
export type Subject = 'Connection' | 'User' | 'Role' | 'all';
export type AppAbility = MongoAbility<[Action, Subject]>;

// Monta a Ability de UM usuário a partir das Permission das Role(s) dele (Prisma). Chamada a
// cada request (PermissionsGuard) — sem cache: revogar uma role tem efeito imediato, não só
// depois de um novo login.
@Injectable()
export class CaslAbilityFactory {
  createForUser(user: NonNullable<UserWithRoles>): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    for (const userRole of user.roles) {
      for (const perm of userRole.role.permissions) {
        const action = perm.action as Action;
        const subject = perm.subject as Subject;
        const fields = (perm.fields as string[] | null) ?? undefined;
        const conditions = (perm.conditions as Record<string, unknown> | null) ?? undefined;
        if (perm.inverted) {
          cannot(action, subject, fields as any, conditions as any).because(perm.reason ?? 'bloqueado pela role');
        } else {
          can(action, subject, fields as any, conditions as any);
        }
      }
    }

    return build();
  }
}
