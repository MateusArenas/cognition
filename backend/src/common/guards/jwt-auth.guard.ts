import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = { id: string; email: string }>(err: unknown, user: TUser | false, _info: unknown, _context: ExecutionContext): TUser {
    if (err || !user) {
      throw new UnauthorizedException({ message: 'Faça login novamente.', code: 'UNAUTHENTICATED' });
    }
    return user;
  }
}
