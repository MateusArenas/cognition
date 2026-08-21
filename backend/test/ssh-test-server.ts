import { Client as SshClient, Server as SshServer } from 'ssh2';
import { generateEd25519KeyPair } from '../src/ssh/ssh-key.util';

export const TEST_SSH_USER = 'tester';
export const TEST_SSH_PASSWORD = 'senha-de-teste';

// Servidor SSH real, em processo, escutando em 127.0.0.1 numa porta aleatória — mesmo espírito
// de sample-target-db.ts (banco SQLite descartável pro e2e do cliente de banco): infra que o
// próprio teste possui, sem depender de Docker/rede/imagem externa. Aceita qualquer chave
// pública oferecida (a verificação criptográfica de assinatura é responsabilidade do próprio
// ssh2, client e server — o que este servidor de teste precisa é só provar que NOSSO código
// consegue completar um handshake SSH de verdade, TOFU incluso).
export function startTestSshServer(): Promise<{ port: number; stop: () => void }> {
  const hostKey = generateEd25519KeyPair().privateKeyPem;
  const server = new SshServer({ hostKeys: [hostKey] }, (client) => {
    client
      .on('authentication', (ctx) => {
        if (ctx.method === 'password' && ctx.username === TEST_SSH_USER && ctx.password === TEST_SSH_PASSWORD) return ctx.accept();
        if (ctx.method === 'publickey') return ctx.accept();
        ctx.reject();
      })
      .on('ready', () => {
        client.on('session', (acceptSession) => {
          const session = acceptSession();
          session.on('pty', (acceptPty) => acceptPty?.());
          session.on('shell', (acceptShell) => {
            const stream = acceptShell();
            stream.write('bem-vindo\r\n');
            stream.on('data', (data: Buffer) => stream.write(data)); // eco
          });
        });
      })
      .on('error', () => undefined);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ port, stop: () => server.close() });
    });
  });
}

export type { SshClient };
