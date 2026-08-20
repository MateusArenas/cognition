import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET não configurada — veja backend/.env.example.');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  // O que cai aqui vira `req.user` — minimalista de propósito (id+email só). Quem precisa de
  // roles/permissões busca fresco no Prisma (PermissionsGuard), nunca confia em claim antiga
  // do token pra isso — revogar uma role tem que valer na hora, não só no próximo login.
  validate(payload: JwtPayload) {
    return { id: payload.sub, email: payload.email };
  }
}
