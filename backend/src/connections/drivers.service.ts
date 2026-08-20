import { Injectable } from '@nestjs/common';

export interface DriverInfo {
  client: string;
  family: 'pg' | 'mysql' | 'sqlite' | 'mssql' | 'oracle';
  label: string;
  installed: boolean;
}

const CATALOG: Omit<DriverInfo, 'installed'>[] = [
  { client: 'pg', family: 'pg', label: 'PostgreSQL' },
  { client: 'pg-native', family: 'pg', label: 'PostgreSQL (native)' },
  { client: 'cockroachdb', family: 'pg', label: 'CockroachDB' },
  { client: 'redshift', family: 'pg', label: 'Amazon Redshift' },
  { client: 'mysql2', family: 'mysql', label: 'MySQL / MariaDB' },
  { client: 'sqlite3', family: 'sqlite', label: 'SQLite' },
  { client: 'better-sqlite3', family: 'sqlite', label: 'SQLite (better-sqlite3)' },
  { client: 'tedious', family: 'mssql', label: 'SQL Server' },
  { client: 'oracledb', family: 'oracle', label: 'Oracle' },
];

const PACKAGE_BY_CLIENT: Record<string, string> = {
  pg: 'pg',
  'pg-native': 'pg-native',
  cockroachdb: 'pg',
  redshift: 'pg',
  mysql2: 'mysql2',
  sqlite3: 'sqlite3',
  'better-sqlite3': 'better-sqlite3',
  tedious: 'tedious',
  oracledb: 'oracledb',
};

// GET /drivers — DB-MOBILE.md §4.1: "o knex não traz driver nenhum: você instala o do banco".
// Esta rota responde quais `require.resolve` funcionam NESTE servidor, pra tela de Conexão do
// app avisar antes de tentar conectar com um dialeto sem driver instalado.
@Injectable()
export class DriversService {
  list(): DriverInfo[] {
    return CATALOG.map((d) => ({ ...d, installed: this.isInstalled(d.client) }));
  }

  private isInstalled(client: string): boolean {
    const pkg = PACKAGE_BY_CLIENT[client];
    if (!pkg) return false;
    try {
      require.resolve(pkg);
      return true;
    } catch {
      return false;
    }
  }
}
