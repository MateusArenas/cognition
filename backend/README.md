# backend

API do cliente de banco de dados (NestJS + Knex + Prisma + CASL). Documentação completa,
arquitetura e "como rodar": [docs/17-db-client.md](../docs/17-db-client.md) na raiz do
monorepo. Especificação funcional de origem: [DB-MOBILE.md](../DB-MOBILE.md).

```bash
cp .env.example .env
npm install
npx prisma migrate dev
npm run db:seed
npm run start:dev   # http://localhost:3333/api/v1 — Swagger em /api/docs

npm run test        # unitários
npm run test:e2e    # e2e (supertest, SQLite efêmero — sem Postgres necessário)
```
