import { decrypt, encrypt, PASSWORD_MASK } from './crypto.util';

describe('crypto.util', () => {
  beforeAll(() => {
    process.env.APP_SECRET = 'segredo-de-teste';
  });

  it('cifra e decifra de volta pro valor original', () => {
    const enc = encrypt('senha-super-secreta');
    expect(enc).toMatch(/^enc:/);
    expect(enc).not.toContain('senha-super-secreta');
    expect(decrypt(enc)).toBe('senha-super-secreta');
  });

  it('decrypt() é passthrough pra valor que já não está cifrado (nunca cifra duas vezes)', () => {
    expect(decrypt('já em claro')).toBe('já em claro');
  });

  it('duas cifradas do mesmo valor não são iguais (IV aleatório) mas as duas decifram certo', () => {
    const a = encrypt('mesma-senha');
    const b = encrypt('mesma-senha');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('mesma-senha');
    expect(decrypt(b)).toBe('mesma-senha');
  });

  it('PASSWORD_MASK nunca é confundido com um valor cifrado de verdade', () => {
    expect(PASSWORD_MASK.startsWith('enc:')).toBe(false);
  });
});
