// Prisma 7: a URL de conexão do CLI (migrate/studio) vem daqui, não mais de schema.prisma.
// A aplicação em runtime (src/prisma/prisma.service.ts) lê DATABASE_URL direto do processo e
// monta o adaptador (@prisma/adapter-pg) ela mesma — este arquivo só serve os comandos `prisma
// migrate`/`prisma studio` rodados manualmente contra o Postgres do docker-compose.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
