import { CaslAbilityFactory } from './casl-ability.factory';
import type { UserWithRoles } from '../users/users.service';

function userWith(permissions: { action: string; subject: string; inverted?: boolean; conditions?: unknown }[]): NonNullable<UserWithRoles> {
  return {
    id: 'u1',
    email: 'a@a.com',
    name: 'A',
    passwordHash: 'x',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    roles: [
      {
        userId: 'u1',
        roleId: 'r1',
        role: {
          id: 'r1',
          name: 'role',
          description: null,
          createdAt: new Date(),
          permissions: permissions.map((p, i) => ({
            id: `p${i}`,
            action: p.action,
            subject: p.subject,
            fields: null,
            conditions: (p.conditions as never) ?? null,
            inverted: p.inverted ?? false,
            reason: null,
            roleId: 'r1',
          })),
        },
      },
    ],
  } as unknown as NonNullable<UserWithRoles>;
}

describe('CaslAbilityFactory', () => {
  const factory = new CaslAbilityFactory();

  it('usuário sem nenhuma permissão não pode nada', () => {
    const ability = factory.createForUser(userWith([]));
    expect(ability.can('read', 'Connection')).toBe(false);
  });

  it('"manage all" (admin) pode qualquer ação em qualquer sujeito', () => {
    const ability = factory.createForUser(userWith([{ action: 'manage', subject: 'all' }]));
    expect(ability.can('read', 'Connection')).toBe(true);
    expect(ability.can('delete', 'User')).toBe(true);
  });

  it('permissão granular só libera a ação declarada', () => {
    const ability = factory.createForUser(userWith([{ action: 'read', subject: 'Connection' }]));
    expect(ability.can('read', 'Connection')).toBe(true);
    expect(ability.can('create', 'Connection')).toBe(false);
    expect(ability.can('read', 'User')).toBe(false);
  });

  it('regra invertida (cannot) bloqueia mesmo com uma regra "can" mais ampla antes', () => {
    const ability = factory.createForUser(
      userWith([
        { action: 'manage', subject: 'Connection' },
        { action: 'delete', subject: 'Connection', inverted: true },
      ])
    );
    expect(ability.can('read', 'Connection')).toBe(true);
    expect(ability.can('delete', 'Connection')).toBe(false);
  });

  it('condição estilo Mongo restringe a regra a instâncias específicas', () => {
    const ability = factory.createForUser(userWith([{ action: 'update', subject: 'Connection', conditions: { ownerId: 'u1' } }]));
    expect(ability.can('update', { __caslSubjectType__: 'Connection', ownerId: 'u1' } as never)).toBe(true);
    expect(ability.can('update', { __caslSubjectType__: 'Connection', ownerId: 'outro' } as never)).toBe(false);
  });

  it('revogar a role (nenhuma permissão) some com o acesso na hora — sem cache', () => {
    const withPerm = factory.createForUser(userWith([{ action: 'read', subject: 'Connection' }]));
    const withoutPerm = factory.createForUser(userWith([]));
    expect(withPerm.can('read', 'Connection')).toBe(true);
    expect(withoutPerm.can('read', 'Connection')).toBe(false);
  });
});
