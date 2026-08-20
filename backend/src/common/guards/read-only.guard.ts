import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ConnectionsService } from '../../connections/connections.service';

// Bloqueia escrita numa conexão marcada como somente-leitura (flag do PRÓPRIO app, não do
// banco) — DB-MOBILE.md §4.8. Só entra no MutationsModule; leitura de catálogo nunca passa por
// aqui.
@Injectable()
export class ReadOnlyGuard implements CanActivate {
  constructor(private readonly connections: ConnectionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user: { id: string } }>();
    const id = String(req.params.id);
    const connection = await this.connections.findOwned(id, req.user.id);
    if (connection.readOnly) {
      throw new ForbiddenException({ message: 'Conexão marcada como somente leitura.', code: 'READ_ONLY' });
    }
    return true;
  }
}
