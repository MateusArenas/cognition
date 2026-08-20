import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Banco-alvo de EXEMPLO (não confundir com o Postgres de metadados do Prisma) — o mesmo tipo
// de banco que um usuário do app conectaria de verdade, só que SQLite pra rodar sem servidor
// neste ambiente. PK, FK e índice o suficiente pra exercitar introspecção/DDL/ERD/rows/
// mutations de ponta a ponta (ver CHECKLIST.md, Etapa DB1).
export function createSampleTargetDb(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'dbmobile-target-'));
  const path = join(dir, 'sample.db');
  const db = new Database(path);
  db.exec(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      status TEXT NOT NULL DEFAULT 'open',
      total REAL NOT NULL
    );
    CREATE INDEX idx_orders_customer ON orders(customer_id);
    INSERT INTO customers (name, email) VALUES ('Ana', 'ana@exemplo.com'), ('Bruno', 'bruno@exemplo.com');
    INSERT INTO orders (customer_id, status, total) VALUES (1, 'open', 100.5), (1, 'closed', 42), (2, 'open', 10);
  `);
  db.close();
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
