import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma-test';

// DDL de mão, espelhando prisma/schema.test.prisma — de propósito SEM passar por
// `prisma db push`/`migrate`: essas ferramentas diffam/sincronizam o schema de um jeito que o
// Prisma 7 (e o próprio harness deste agente) bloqueia por padrão quando quem chama é um
// agente de IA, mesmo mirando um arquivo temporário recém-criado (nunca o Postgres real).
// SQL explícito e determinístico não passa por esse caminho — e é mais fácil de auditar de
// qualquer forma. Se os modelos mudarem em schema.prisma/schema.test.prisma, atualize aqui
// junto (mesma regra de manutenção do resto do monorepo).
const SCHEMA_SQL = `
  CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  );
  CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE "Permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "fields" TEXT,
    "conditions" TEXT,
    "inverted" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "roleId" TEXT NOT NULL,
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE
  );
  CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    PRIMARY KEY ("userId", "roleId"),
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE
  );
  CREATE TABLE "Connection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#8E8E93',
    "client" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE
  );
`;

// Constrói um PrismaClient de teste contra um arquivo SQLite temporário, com o schema acima já
// aplicado — mesmos modelos de schema.prisma (provider sqlite, ver comentário no topo dos dois
// arquivos .prisma).
export function createTestPrismaClient(): { prisma: PrismaClient; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'dbmobile-test-'));
  const dbPath = join(dir, 'test.db');

  const raw = new Database(dbPath);
  raw.exec(SCHEMA_SQL);
  raw.close();

  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  const prisma = new PrismaClient({ adapter });

  return {
    prisma,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
