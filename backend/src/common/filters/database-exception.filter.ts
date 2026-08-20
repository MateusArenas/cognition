import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';

interface DriverError {
  message?: string;
  code?: string | number;
  errno?: string | number;
  position?: string | number;
  hint?: string;
  detail?: string;
  sqlMessage?: string;
}

// Filtro global (DB-MOBILE.md §4.10): toda resposta de erro sai no MESMO formato
// `{ message, code?, position?, hint? }`, seja um erro de validação/HTTP do Nest (passa o
// corpo adiante) ou um erro cru do driver do banco-alvo (pg/mysql2/sqlite3/tedious) — o app
// usa `position`/`hint` pra destacar onde a consulta falhou.
@Catch()
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DatabaseExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        res.status(status).json({ message: body });
        return;
      }
      const b = body as Record<string, unknown>;
      const message = Array.isArray(b.message) ? b.message.join('; ') : (b.message ?? exception.message);
      // Espalha o corpo inteiro (não só message/code/position/hint) — exceções como CONFLICT
      // (mutations.service.ts) anexam campos extras (`index`, `affected`) que o app precisa
      // pra saber qual mudança do lote falhou.
      res.status(status).json({ ...b, message });
      return;
    }

    const err = exception as DriverError;
    const message = err.sqlMessage || err.message || 'Erro inesperado.';
    const code = err.code ?? err.errno;
    const position = err.position !== undefined ? Number(err.position) || undefined : undefined;
    const hint = err.hint ?? err.detail;
    const status = code || position || hint ? 400 : 500;

    if (status === 500) this.logger.error(message, (exception as Error)?.stack);
    res.status(status).json({ message, code, position, hint });
  }
}
