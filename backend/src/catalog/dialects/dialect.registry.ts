import { Injectable, NotImplementedException } from '@nestjs/common';
import type { DialectStrategy } from './dialect.types';
import { MssqlStrategy } from './mssql.strategy';
import { MysqlStrategy } from './mysql.strategy';
import { OracleStrategy } from './oracle.strategy';
import { PgStrategy } from './pg.strategy';
import { SqliteStrategy } from './sqlite.strategy';

// Controller/IntrospectService pedem `registry.for(connection.client)` e nunca escrevem um
// `if (dialeto === ...)` — DB-MOBILE.md §4.2. Adicionar um dialeto novo é uma linha aqui.
@Injectable()
export class DialectRegistry {
  private readonly strategies: DialectStrategy[] = [
    new PgStrategy(),
    new MysqlStrategy(),
    new SqliteStrategy(),
    new MssqlStrategy(),
    new OracleStrategy(),
  ];

  for(client: string): DialectStrategy {
    const strategy = this.strategies.find((s) => s.clients.includes(client));
    if (!strategy) {
      throw new NotImplementedException({ message: `Dialeto "${client}" sem estratégia de introspecção.`, code: 'UNKNOWN_DIALECT' });
    }
    return strategy;
  }
}
