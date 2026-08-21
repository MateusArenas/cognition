// `btoa` não é garantido global no runtime RN/Hermes (mesmo motivo do decodificador à mão em
// features/csv/ImportSheet.tsx, latin1FromBase64) — encoder escrito à mão pras sequências de
// controle curtas que a KeyBar manda direto pro socket (todas ASCII/Latin1, cabe em byte único
// por caractere, sem precisar de TextEncoder pra UTF-8 multibyte).
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64EncodeAscii(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i += 3) {
    const b0 = input.charCodeAt(i) & 0xff;
    const b1 = i + 1 < input.length ? input.charCodeAt(i + 1) & 0xff : undefined;
    const b2 = i + 2 < input.length ? input.charCodeAt(i + 2) & 0xff : undefined;

    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? '=' : ALPHABET[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? '=' : ALPHABET[b2 & 0x3f];
  }
  return out;
}
