import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // `passport-jwt` passa em `info` o erro específico do `jsonwebtoken` (TokenExpiredError pra
  // token vencido, JsonWebTokenError pra assinatura/formato inválido, etc.) — antes esse
  // parâmetro era descartado e todo 401 saía igual. O app precisa distinguir "vencido, vale a
  // pena tentar /auth/refresh" de "inválido, direto pro login" — só o código muda, mensagem e
  // status continuam os mesmos de antes pra quem já tratava só UNAUTHENTICATED.
  //
  // Checagem por `.name`, não `instanceof TokenExpiredError`: este é um monorepo com npm
  // workspaces — `jsonwebtoken` acabou instalado em dois lugares (raiz E backend/node_modules,
  // versões ligeiramente diferentes), e `passport-jwt` pode resolver uma cópia diferente da que
  // este arquivo importaria. `instanceof` entre duas classes de módulos distintos falha
  // silenciosamente (bug real, pego rodando o e2e); `.name` é só uma string, sempre igual
  // não importa qual cópia do pacote criou o erro.
  handleRequest<TUser = { id: string; email: string }>(
    err: unknown,
    user: TUser | false,
    info: unknown,
    _context: ExecutionContext
  ): TUser {
    if (err || !user) {
      const expired = info instanceof Error && info.name === 'TokenExpiredError';
      throw new UnauthorizedException(
        expired
          ? { message: 'Sessão expirada.', code: 'TOKEN_EXPIRED' }
          : { message: 'Faça login novamente.', code: 'UNAUTHENTICATED' }
      );
    }
    return user;
  }
}
