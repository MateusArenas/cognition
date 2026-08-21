import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  jti: string;
}

// Segredo/expiração próprios do refresh token — NUNCA o mesmo JwtService do access token (§
// auth.module.ts), senão um access token vazaria como refresh e vice-versa. Lê
// `process.env` preguiçosamente a cada chamada, mesmo motivo de testabilidade que já justifica
// `JwtStrategy` ler direto no construtor em vez de via `JwtModule.registerAsync` DI: em teste,
// `bootstrap-app.ts` só seta `JWT_REFRESH_SECRET` depois que este módulo já foi importado — ler
// cedo demais pegaria `undefined`.
@Injectable()
export class RefreshTokenService {
  private client(): JwtService {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) throw new Error('JWT_REFRESH_SECRET não configurada — veja backend/.env.example.');
    return new JwtService({ secret, signOptions: { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' } });
  }

  // `jti` aleatório sempre novo — sem ele, dois refresh tokens da MESMA sessão assinados no
  // MESMO segundo (sub+sid+iat+exp idênticos) viram literalmente a mesma string, quebrando a
  // detecção de reuso na rotação (o token "antigo" continuaria batendo com o hash guardado do
  // "novo"). Bug real, pego no e2e rodando rápido o bastante pra dois refreshes caírem no
  // mesmo segundo.
  async sign(payload: Omit<RefreshTokenPayload, 'jti'>): Promise<string> {
    return this.client().signAsync({ ...payload, jti: randomUUID() });
  }

  async verify(token: string): Promise<RefreshTokenPayload> {
    return this.client().verifyAsync<RefreshTokenPayload>(token);
  }

  // Decodifica o `exp` (segundos unix) que o próprio signAsync já colocou no token, em vez de
  // reparsear a string de duração (`JWT_REFRESH_EXPIRES_IN`) de novo — uma fonte única de
  // verdade pro "quando esse token vence", sempre consistente com o que foi realmente assinado.
  expiryOf(token: string): Date {
    const decoded = this.client().decode(token) as { exp?: number } | null;
    if (!decoded?.exp) throw new Error('Token de refresh sem `exp` — não deveria acontecer.');
    return new Date(decoded.exp * 1000);
  }

  // sha256 simples (não bcrypt): isto não é uma senha de baixa entropia digitada por humano —
  // é um JWT assinado, já com entropia alta o bastante pra um hash rápido bastar (mesmo
  // trade-off de PasswordResetToken).
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
