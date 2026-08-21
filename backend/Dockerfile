# Build da própria API — opcional pro dia a dia (docker-compose.yml na raiz só sobe o Postgres
# de dados próprios; rodar o backend com `npm run start:dev` local é mais rápido pra
# desenvolver). Serve pra empacotar o backend quando for hora de publicar de verdade.
FROM node:20-slim AS build
WORKDIR /app
# python3/make/g++: node-gyp precisa pra compilar o binding nativo do better-sqlite3 (usado nos
# testes e2e contra SQLite, ver docs/17-db-client.md) — sem isso `npm install` quebra em
# "Could not find any Python installation to use". Só precisa existir neste estágio: o binário
# compilado já vai pronto dentro de node_modules pro estágio de runtime.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install
COPY . .
# prisma.config.ts lê DATABASE_URL via env() e falha ao carregar (mesmo só pra `generate`, que
# não abre conexão nenhuma) se a variável não existir — placeholder só pra este passo, descartado
# depois: em runtime quem manda é o DATABASE_URL de verdade (docker-compose.yml/backend/.env).
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npx prisma generate
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# openssl: os engines nativos do Prisma (query engine/generate) detectam a versão do libssl pra
# escolher o binário certo — sem isso, "Prisma failed to detect the libssl/openssl version...
# Defaulting to openssl-1.1.x" (achado rodando de verdade contra o Postgres do compose).
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package*.json ./
# node_modules COMPLETO (com devDependencies) reaproveitado do build, não reinstalado do zero —
# de propósito: `prisma` (CLI) e `ts-node` são devDependencies, mas `prisma migrate deploy` e
# `npm run db:seed` (ver docs/17-db-client.md §"Deploy em VPS") rodam DENTRO deste container via
# `docker compose exec`, depois que ele já está de pé. Cortar devDependencies aqui deixaria a
# imagem menor mas quebraria os dois comandos — nesta escala (uma VPS, um serviço) não compensa a
# complexidade de um estágio à parte só pra migração.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
# tsconfig.json: `npm run db:seed` (ts-node) precisa dele pra registrar o loader de .ts — sem
# ele, ts-node não acha o arquivo e o `node` puro tenta carregar prisma/seed.ts direto e falha
# com "Unknown file extension .ts" (achado rodando de verdade o comando neste container).
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 3333
CMD ["node", "dist/main.js"]
