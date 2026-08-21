import { createHash, generateKeyPairSync, randomBytes } from 'crypto';

// Chave Ed25519 gerada no SERVIDOR (node:crypto) — a privada já nasce cifrada (ver
// credentials.service.ts, encrypt() de common/crypto.util.ts) e nunca é devolvida em claro pela
// API depois de criada.
export interface GeneratedEd25519KeyPair {
  privateKeyPem: string; // formato "OPENSSH PRIVATE KEY" — o único que ssh2 entende pra Ed25519
  publicKeyOpenSsh: string; // 'ssh-ed25519 AAAA...'
  fingerprintSha256: string; // 'SHA256:...' — mesmo formato que `ssh-keygen -lf` mostra
}

function uint32BE(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

// Campo "string" do formato wire do SSH (RFC 4251 §5): [uint32 tamanho][bytes].
function wireString(field: Buffer): Buffer {
  return Buffer.concat([uint32BE(field.length), field]);
}

// Formato "wire" do SSH pra chave pública: dois campos wireString concatenados — o nome do tipo
// ('ssh-ed25519') e a chave crua (32 bytes). Usado tanto na linha "ssh-ed25519 AAAA..." quanto
// no arquivo de chave privada abaixo (ela embute a pública também).
function publicKeyBlob(rawPublicKey: Buffer): Buffer {
  return Buffer.concat([wireString(Buffer.from('ssh-ed25519')), wireString(rawPublicKey)]);
}

export function fingerprintOf(wireBlob: Buffer): string {
  const digest = createHash('sha256').update(wireBlob).digest('base64').replace(/=+$/, '');
  return `SHA256:${digest}`;
}

// ssh2 (protocol/keyParser.js) só sabe ler dois formatos de chave privada: PEM tradicional
// ("BEGIN RSA/DSA/EC PRIVATE KEY", que não existe pra Ed25519) e o "openssh-key-v1" novo — NÃO
// entende PKCS8 ("BEGIN PRIVATE KEY", o que node:crypto produz nativamente). Então a chave
// privada Ed25519 tem que ser serializada à mão nesse formato binário — struct documentada em
// PROTOCOL.key do próprio OpenSSH:
//
//   "openssh-key-v1\0"
//   string  ciphername ('none' — sem passphrase nesta v1, ver docs/20-ssh-mobile.md)
//   string  kdfname ('none')
//   string  kdfoptions ('')
//   uint32  número de chaves (1)
//   string  chave pública (o mesmo blob de publicKeyBlob() acima)
//   string  bloco privado (ver privateSection() abaixo), cifrado só se ciphername != 'none'
//
// Tudo em base64, quebrado em linhas de 70 colunas, entre os marcadores BEGIN/END.
function privateSection(rawSeed: Buffer, rawPublicKey: Buffer): Buffer {
  // "secret key" no formato libsodium que o OpenSSH usa internamente: seed(32) + chave pública
  // (32) concatenados, 64 bytes — não é só a seed sozinha.
  const secretKey = Buffer.concat([rawSeed, rawPublicKey]);
  const check = randomBytes(4); // checkint repetido 2x — o parser confirma que decifrou certo comparando os dois
  const unpadded = Buffer.concat([
    check,
    check,
    wireString(Buffer.from('ssh-ed25519')),
    wireString(rawPublicKey),
    wireString(secretKey),
    wireString(Buffer.alloc(0)), // comentário — vazio nesta v1
  ]);
  // Padding 1,2,3… até múltiplo de 8 (block size de uma cifra "none") — é assim que o parser
  // detecta onde os dados de verdade terminam.
  const blockSize = 8;
  const padLen = (blockSize - (unpadded.length % blockSize)) % blockSize;
  const padding = Buffer.from(Array.from({ length: padLen }, (_, i) => i + 1));
  return Buffer.concat([unpadded, padding]);
}

function opensshPrivateKeyPem(rawSeed: Buffer, rawPublicKey: Buffer): string {
  const body = Buffer.concat([
    Buffer.from('openssh-key-v1\0'),
    wireString(Buffer.from('none')),
    wireString(Buffer.from('none')),
    wireString(Buffer.alloc(0)),
    uint32BE(1),
    wireString(publicKeyBlob(rawPublicKey)),
    wireString(privateSection(rawSeed, rawPublicKey)),
  ]);
  const b64 = body.toString('base64');
  const lines = b64.match(/.{1,70}/g) ?? [b64];
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${lines.join('\n')}\n-----END OPENSSH PRIVATE KEY-----\n`;
}

export function generateEd25519KeyPair(): GeneratedEd25519KeyPair {
  // node:crypto fala PKCS8/SPKI (DER), não os formatos "linha OpenSSH"/"openssh-key-v1" acima —
  // usado só pra gerar os bytes crus da chave, nunca pro PEM final. SPKI DER de uma chave
  // Ed25519 tem SEMPRE 44 bytes (12 de cabeçalho ASN.1 fixo + 32 de chave crua) e PKCS8 DER tem
  // SEMPRE 48 (16 + 32 de seed) — o algoritmo não tem parâmetro nenhum, então o cabeçalho nunca
  // varia; `subarray(-32)` é a forma padrão (usada em várias libs) de pegar os bytes crus sem
  // precisar de um parser ASN.1 de verdade.
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  const rawPublicKey = publicKey.subarray(publicKey.length - 32);
  const rawSeed = privateKey.subarray(privateKey.length - 32);
  const wireBlob = publicKeyBlob(rawPublicKey);

  return {
    privateKeyPem: opensshPrivateKeyPem(rawSeed, rawPublicKey),
    publicKeyOpenSsh: `ssh-ed25519 ${wireBlob.toString('base64')}`,
    fingerprintSha256: fingerprintOf(wireBlob),
  };
}

// O blob "wire" de uma chave de host (o que hostVerifier recebe durante o handshake) começa com
// [uint32 tamanho][nome do algoritmo] — 'ssh-ed25519', 'ssh-rsa', 'ecdsa-sha2-nistp256' etc.
// Não precisa decodificar o resto pra saber o tipo.
export function sshKeyTypeFromWireBlob(key: Buffer): string {
  const len = key.readUInt32BE(0);
  return key.subarray(4, 4 + len).toString('utf8');
}

// Fingerprint de uma chave pública já em formato "linha OpenSSH" colada pelo usuário
// ('ssh-ed25519 AAAA... comentário opcional') — usado na importação, quando a chave privada
// vem de outro lugar mas o usuário também cola a pública.
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export function fingerprintFromOpenSshLine(line: string): string | undefined {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 2 || !BASE64_RE.test(parts[1])) return undefined;
  try {
    return fingerprintOf(Buffer.from(parts[1], 'base64'));
  } catch {
    return undefined;
  }
}
