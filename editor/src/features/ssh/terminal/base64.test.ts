import { describe, expect, it } from 'vitest';
import { base64EncodeAscii } from './base64';

describe('base64EncodeAscii', () => {
  it('bate com Buffer.toString("base64") do Node pra texto comum', () => {
    expect(base64EncodeAscii('hello')).toBe(Buffer.from('hello', 'latin1').toString('base64'));
    expect(base64EncodeAscii('ping-e2e\n')).toBe(Buffer.from('ping-e2e\n', 'latin1').toString('base64'));
  });

  it('sequências de controle curtas (as que a KeyBar manda) codificam certo', () => {
    expect(base64EncodeAscii('\x1b')).toBe(Buffer.from('\x1b', 'latin1').toString('base64')); // esc
    expect(base64EncodeAscii('\x03')).toBe(Buffer.from('\x03', 'latin1').toString('base64')); // ^C
    expect(base64EncodeAscii('\x1b[A')).toBe(Buffer.from('\x1b[A', 'latin1').toString('base64')); // seta pra cima
    expect(base64EncodeAscii('\t')).toBe(Buffer.from('\t', 'latin1').toString('base64')); // tab
  });

  it('padding correto pros três restos possíveis de tamanho (0, 1, 2 bytes sobrando)', () => {
    expect(base64EncodeAscii('a')).toBe(Buffer.from('a', 'latin1').toString('base64'));
    expect(base64EncodeAscii('ab')).toBe(Buffer.from('ab', 'latin1').toString('base64'));
    expect(base64EncodeAscii('abc')).toBe(Buffer.from('abc', 'latin1').toString('base64'));
  });

  it('string vazia', () => {
    expect(base64EncodeAscii('')).toBe('');
  });
});
