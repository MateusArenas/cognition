import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// AES-256-GCM. Chave = sha256(APP_SECRET) — nunca a senha em claro, nem a chave, tocam disco
// fora deste módulo. Formato de saída: 'enc:<iv>.<tag>.<ciphertext>' (tudo base64) — o prefixo
// 'enc:' é o que diferencia "já cifrado" de "valor novo ainda em claro" em decrypt().
//
// Vive em common/ (não dentro de connections/, onde nasceu) porque é usado por mais de um
// módulo — connections/ cifra a senha do banco-alvo, ssh/ cifra chave privada/passphrase/senha
// do host (docs/20-ssh-mobile.md). Mesma chave derivada de APP_SECRET nos dois casos.
function deriveKey(): Buffer {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error('APP_SECRET não configurada — veja backend/.env.example.');
  return createHash('sha256').update(secret).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decrypt(value: string): string {
  if (!value.startsWith('enc:')) return value;
  const [ivB64, tagB64, dataB64] = value.slice(4).split('.');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export const PASSWORD_MASK = '••••••••';
