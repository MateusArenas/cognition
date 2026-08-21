import jwt from 'jsonwebtoken';

export interface WsUser {
  id: string;
  email: string;
}

export type WsAuthResult = { ok: true; user: WsUser } | { ok: false; code: 'TOKEN_EXPIRED' | 'UNAUTHENTICATED'; message: string };

// Sem precedente de WebSocket neste backend — JwtStrategy (auth/strategies/jwt.strategy.ts)
// resolve isso pro REST via passport, mas um WsGateway não passa pelo pipeline HTTP/Passport.
// Verifica o mesmo JWT_SECRET, à mão, no handshake do socket (`client.handshake.auth.token`) —
// mesmos códigos de erro que JwtAuthGuard já usa (TOKEN_EXPIRED vs UNAUTHENTICATED), pro cliente
// tratar os dois casos igual não importa se veio de HTTP ou do gateway.
//
// Checagem por `.name`, não `instanceof` — mesmo motivo do comentário em jwt-auth.guard.ts:
// monorepo com npm workspaces pode resolver duas cópias de `jsonwebtoken`.
export function verifyWsToken(token: string | undefined): WsAuthResult {
  if (!token) return { ok: false, code: 'UNAUTHENTICATED', message: 'Faça login novamente.' };

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não configurada — veja backend/.env.example.');

  try {
    const payload = jwt.verify(token, secret) as { sub: string; email: string };
    return { ok: true, user: { id: payload.sub, email: payload.email } };
  } catch (err) {
    const expired = err instanceof Error && err.name === 'TokenExpiredError';
    return expired
      ? { ok: false, code: 'TOKEN_EXPIRED', message: 'Sessão expirada.' }
      : { ok: false, code: 'UNAUTHENTICATED', message: 'Faça login novamente.' };
  }
}
