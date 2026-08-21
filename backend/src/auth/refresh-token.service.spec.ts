import { RefreshTokenService } from './refresh-token.service';

describe('RefreshTokenService', () => {
  beforeEach(() => {
    process.env.JWT_REFRESH_SECRET = 'refresh-secret-de-teste';
    process.env.JWT_REFRESH_EXPIRES_IN = '1h';
  });

  it('assina e verifica de volta pro mesmo payload', async () => {
    const service = new RefreshTokenService();
    const token = await service.sign({ sub: 'user-1', sid: 'session-1' });
    const payload = await service.verify(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.sid).toBe('session-1');
  });

  it('rejeita token expirado', async () => {
    process.env.JWT_REFRESH_EXPIRES_IN = '-10s';
    const service = new RefreshTokenService();
    const token = await service.sign({ sub: 'user-1', sid: 'session-1' });
    await expect(service.verify(token)).rejects.toThrow();
  });

  it('hash() é determinístico (mesmo token -> mesmo hash) e nunca igual ao token original', () => {
    const service = new RefreshTokenService();
    const a = service.hash('token-de-exemplo');
    const b = service.hash('token-de-exemplo');
    expect(a).toBe(b);
    expect(a).not.toBe('token-de-exemplo');
  });

  it('expiryOf() decodifica o exp assinado no token', async () => {
    process.env.JWT_REFRESH_EXPIRES_IN = '1h';
    const service = new RefreshTokenService();
    const before = Date.now();
    const token = await service.sign({ sub: 'user-1', sid: 'session-1' });
    const expiresAt = service.expiryOf(token);
    expect(expiresAt.getTime()).toBeGreaterThan(before + 59 * 60 * 1000);
    expect(expiresAt.getTime()).toBeLessThan(before + 61 * 60 * 1000);
  });

  it('hash() de tokens diferentes produz hashes diferentes', () => {
    const service = new RefreshTokenService();
    expect(service.hash('token-a')).not.toBe(service.hash('token-b'));
  });

  it('lança com a mesma convenção de mensagem quando JWT_REFRESH_SECRET não está configurada', async () => {
    delete process.env.JWT_REFRESH_SECRET;
    const service = new RefreshTokenService();
    await expect(service.sign({ sub: 'user-1', sid: 'session-1' })).rejects.toThrow(/JWT_REFRESH_SECRET/);
  });
});
