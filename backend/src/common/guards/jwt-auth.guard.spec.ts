import { TokenExpiredError } from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard.handleRequest', () => {
  const guard = new JwtAuthGuard();

  it('token expirado -> code TOKEN_EXPIRED', () => {
    const info = new TokenExpiredError('jwt expired', new Date());
    expect(() => guard.handleRequest(null, false, info, {} as never)).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 'TOKEN_EXPIRED' }) })
    );
  });

  it('token ausente/inválido -> code UNAUTHENTICATED', () => {
    expect(() => guard.handleRequest(null, false, undefined, {} as never)).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 'UNAUTHENTICATED' }) })
    );
  });

  it('erro genérico (não TokenExpiredError) -> code UNAUTHENTICATED', () => {
    expect(() => guard.handleRequest(new Error('boom'), false, new Error('outro'), {} as never)).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 'UNAUTHENTICATED' }) })
    );
  });

  it('usuário válido -> retorna o usuário, não lança', () => {
    const user = { id: 'u1', email: 'a@b.com' };
    expect(guard.handleRequest(null, user, undefined, {} as never)).toBe(user);
  });
});
