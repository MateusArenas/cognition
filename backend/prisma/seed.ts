// Cria a primeira role (admin, `manage all`) e o primeiro usuário — sem isso, ninguém consegue
// nem POST /users, porque essa rota já exige permissão CASL de `create User`, que ninguém tem
// até existir um admin. Rodar uma vez, contra o Postgres de verdade (`npm run db:seed`, ver
// docs/17-db-client.md). Idempotente: pode rodar de novo sem duplicar nada.
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL não configurada — veja backend/.env.example.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const email = process.env.SEED_ADMIN_EMAIL || 'admin@exemplo.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'troque-esta-senha';

  const role = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin', description: 'Acesso total', permissions: { create: [{ action: 'manage', subject: 'all' }] } },
  });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Usuário ${email} já existe — nada a fazer.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({ data: { email, name: 'Admin', passwordHash, roles: { create: [{ roleId: role.id }] } } });
    // eslint-disable-next-line no-console
    console.log(`Usuário admin criado: ${email} / ${password} — TROQUE A SENHA depois do primeiro login.`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
