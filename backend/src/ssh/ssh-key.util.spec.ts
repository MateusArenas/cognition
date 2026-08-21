import { fingerprintFromOpenSshLine, fingerprintOf, generateEd25519KeyPair, sshKeyTypeFromWireBlob } from './ssh-key.util';

describe('ssh-key.util', () => {
  it('generateEd25519KeyPair: produz uma chave privada em formato "openssh-key-v1" e uma pública em formato OpenSSH', () => {
    const pair = generateEd25519KeyPair();
    expect(pair.privateKeyPem).toMatch(/^-----BEGIN OPENSSH PRIVATE KEY-----/);
    expect(pair.privateKeyPem).toMatch(/-----END OPENSSH PRIVATE KEY-----\n$/);
    expect(pair.publicKeyOpenSsh).toMatch(/^ssh-ed25519 [A-Za-z0-9+/]+=*$/);
    expect(pair.fingerprintSha256).toMatch(/^SHA256:[A-Za-z0-9+/]+$/);
  });

  it('duas chamadas geram pares diferentes (não é determinístico)', () => {
    const a = generateEd25519KeyPair();
    const b = generateEd25519KeyPair();
    expect(a.publicKeyOpenSsh).not.toBe(b.publicKeyOpenSsh);
    expect(a.fingerprintSha256).not.toBe(b.fingerprintSha256);
  });

  it('fingerprintFromOpenSshLine bate com o fingerprint calculado na geração (mesma chave, dois caminhos)', () => {
    const pair = generateEd25519KeyPair();
    const fp = fingerprintFromOpenSshLine(`${pair.publicKeyOpenSsh} comentario@qualquer`);
    expect(fp).toBe(pair.fingerprintSha256);
  });

  it('fingerprintFromOpenSshLine devolve undefined pra linha malformada', () => {
    expect(fingerprintFromOpenSshLine('só-uma-palavra')).toBeUndefined();
    expect(fingerprintFromOpenSshLine('ssh-ed25519 !!!não-é-base64!!!')).toBeUndefined();
  });

  it('sshKeyTypeFromWireBlob extrai o nome do algoritmo do blob wire (formato usado pelo hostVerifier do ssh2)', () => {
    const pair = generateEd25519KeyPair();
    const blobB64 = pair.publicKeyOpenSsh.split(' ')[1];
    const type = sshKeyTypeFromWireBlob(Buffer.from(blobB64, 'base64'));
    expect(type).toBe('ssh-ed25519');
  });

  it('fingerprintOf é estável pro mesmo blob (não usa aleatoriedade)', () => {
    const blob = Buffer.from('conteudo-fixo-de-teste');
    expect(fingerprintOf(blob)).toBe(fingerprintOf(blob));
  });
});
