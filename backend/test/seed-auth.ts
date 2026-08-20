import * as bcrypt from 'bcryptjs';
import type { PrismaClient } from '../src/generated/prisma-test';

export const ADMIN_PASSWORD = 'senha-forte';
export const VIEWER_PASSWORD = 'so-leitura';

// admin: pode tudo (`manage`/`all`, convenção do CASL pra wildcard). viewer: só leitura de
// Connection — usado pros testes de 403 (permissão negada).
export async function seedAdminUser(prisma: PrismaClient, email = 'admin@exemplo.com') {
  const role = await prisma.role.create({ data: { name: `admin-${email}`, permissions: { create: [{ action: 'manage', subject: 'all' }] } } });
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  return prisma.user.create({ data: { email, name: 'Admin', passwordHash, roles: { create: [{ roleId: role.id }] } } });
}

export async function seedViewerUser(prisma: PrismaClient, email = 'viewer@exemplo.com') {
  const role = await prisma.role.create({ data: { name: `viewer-${email}`, permissions: { create: [{ action: 'read', subject: 'Connection' }] } } });
  const passwordHash = await bcrypt.hash(VIEWER_PASSWORD, 10);
  return prisma.user.create({ data: { email, name: 'Viewer', passwordHash, roles: { create: [{ roleId: role.id }] } } });
}
