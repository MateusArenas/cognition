import { SetMetadata } from '@nestjs/common';
import type { Action, Subject } from './casl-ability.factory';

export const CHECK_ABILITY_KEY = 'check_ability';

export interface RequiredRule {
  action: Action;
  subject: Subject;
}

// Marca uma rota com a regra CASL que ela exige — PermissionsGuard lê isso via Reflector.
// Rota sem @CheckAbility() só exige estar autenticado (JwtAuthGuard já cobre isso sozinho).
export const CheckAbility = (action: Action, subject: Subject) => SetMetadata(CHECK_ABILITY_KEY, { action, subject } as RequiredRule);
