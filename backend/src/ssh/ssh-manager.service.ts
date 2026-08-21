import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Client, type ClientChannel, type ConnectConfig } from 'ssh2';
import type { DecryptedSecret } from './credentials.service';
import type { SshHost } from '../generated/prisma';
import { KnownHostsService } from './known-hosts.service';
import { fingerprintOf, sshKeyTypeFromWireBlob } from './ssh-key.util';

const MAX_BUFFER_BYTES = 256 * 1024;
const DETACH_GRACE_MS = 10 * 60 * 1000;

interface PendingHostKey {
  fingerprint: string;
  keyType: string;
  resolve: (valid: boolean) => void;
}

interface LiveSession {
  conn: Client;
  stream?: ClientChannel;
  buffer: Buffer[];
  bufferBytes: number;
  detachTimer?: NodeJS.Timeout;
  pendingHostKey?: PendingHostKey;
  ownerId: string;
  address: string;
  port: number;
}

export interface ConnectOptions {
  ownerId: string;
  host: SshHost;
  secret: DecryptedSecret;
  cols: number;
  rows: number;
  onData: (chunk: Buffer) => void;
  onStatus: (state: 'open' | 'error', message?: string) => void;
  onHostKeyUnknown: (info: { fingerprint: string; keyType: string }) => void;
  onExit: (code: number | null, signal: string | undefined) => void;
}

// Traduz os erros mais comuns de `ssh2` pra uma frase que faz sentido pro usuário — o resto
// (mensagem crua do ssh2) ainda passa, só sem jargão de protocolo quando dá pra evitar.
function translateSshError(err: Error & { level?: string }): string {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === 'ECONNREFUSED') return 'Porta fechada ou host offline.';
  if (code === 'ETIMEDOUT' || code === 'ENOTFOUND') return 'Não foi possível alcançar o endereço.';
  if (err.level === 'client-authentication') return 'Usuário, senha ou chave rejeitados pelo host.';
  return err.message;
}

function buildAuthConfig(secret: DecryptedSecret): Partial<ConnectConfig> {
  if (secret.kind === 'key') {
    return { privateKey: secret.privateKey, passphrase: secret.passphrase };
  }
  return { password: secret.password };
}

// Uma sessão SSH viva por `sessionId` (não por `hostId` — o mesmo host pode ter várias abas
// abertas), em memória. Mesmo espírito do KnexPoolService (connections/knex-pool.service.ts):
// cache de conexão ATIVA, não persistência (isso é SshSession no Prisma, sessions.service.ts).
@Injectable()
export class SshManagerService implements OnModuleDestroy {
  private readonly logger = new Logger(SshManagerService.name);
  private readonly live = new Map<string, LiveSession>();

  constructor(private readonly knownHosts: KnownHostsService) {}

  connect(sessionId: string, opts: ConnectOptions): void {
    const entry: LiveSession = { conn: new Client(), buffer: [], bufferBytes: 0, ownerId: opts.ownerId, address: opts.host.address, port: opts.host.port };
    this.live.set(sessionId, entry);

    const config: ConnectConfig = {
      host: opts.host.address,
      port: opts.host.port,
      username: opts.host.username,
      keepaliveInterval: opts.host.keepalive ? 15000 : 0,
      keepaliveCountMax: 3,
      readyTimeout: 20000,
      algorithms: { serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'rsa-sha2-512', 'rsa-sha2-256'] },
      hostVerifier: (key: Buffer, verify: (valid: boolean) => void) => {
        const fingerprint = fingerprintOf(key);
        const keyType = sshKeyTypeFromWireBlob(key);
        this.knownHosts.verify(opts.ownerId, opts.host.address, opts.host.port, keyType, fingerprint).then((verdict) => {
          if (verdict === 'known') return verify(true);
          if (verdict === 'changed') {
            opts.onStatus('error', 'A chave do host MUDOU. Possível ataque man-in-the-middle — conexão recusada.');
            return verify(false);
          }
          // desconhecida: segura o handshake até trustHostKey() decidir
          entry.pendingHostKey = { fingerprint, keyType, resolve: verify };
          opts.onHostKeyUnknown({ fingerprint, keyType });
        });
      },
      ...buildAuthConfig(opts.secret),
    };

    entry.conn
      .on('ready', () => {
        entry.conn.shell({ term: 'xterm-256color', cols: opts.cols, rows: opts.rows }, (err, stream) => {
          if (err) {
            opts.onStatus('error', translateSshError(err));
            return;
          }
          entry.stream = stream;
          opts.onStatus('open');
          if (opts.host.startupCommand) stream.write(opts.host.startupCommand + '\n');

          stream.on('data', (chunk: Buffer) => {
            this.pushBuffer(entry, chunk);
            opts.onData(chunk);
          });
          stream.stderr.on('data', (chunk: Buffer) => opts.onData(chunk));
          stream.on('close', (code: number | null, signal: string | undefined) => {
            opts.onExit(code, signal);
            this.destroy(sessionId);
          });
        });
      })
      .on('error', (err: Error) => opts.onStatus('error', translateSshError(err)));

    entry.conn.connect(config);
  }

  // Handshake preso esperando confiança de chave desconhecida (§onHostKeyUnknown acima) — só
  // resolve o que o próprio fingerprint pendente pedir; um sessionId diferente ou um fingerprint
  // que não bate não têm efeito nenhum (proteção contra confirmar a chave errada).
  async trustHostKey(sessionId: string, fingerprint: string): Promise<boolean> {
    const entry = this.live.get(sessionId);
    const pending = entry?.pendingHostKey;
    if (!entry || !pending) return false;
    const matches = pending.fingerprint === fingerprint;
    entry.pendingHostKey = undefined;
    if (matches) {
      await this.knownHosts.trust(entry.ownerId, entry.address, entry.port, pending.keyType, pending.fingerprint);
    }
    pending.resolve(matches);
    return matches;
  }

  write(sessionId: string, data: Buffer): void {
    this.live.get(sessionId)?.stream?.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.live.get(sessionId)?.stream?.setWindow(rows, cols, 0, 0);
  }

  /** App foi para background: mantém o SSH vivo por uma carência antes de matar. */
  detach(sessionId: string): void {
    const e = this.live.get(sessionId);
    if (!e || e.detachTimer) return;
    e.detachTimer = setTimeout(() => this.destroy(sessionId), DETACH_GRACE_MS);
  }

  replayBuffer(sessionId: string): Buffer {
    const e = this.live.get(sessionId);
    if (!e) return Buffer.alloc(0);
    if (e.detachTimer) {
      clearTimeout(e.detachTimer);
      e.detachTimer = undefined;
    }
    return Buffer.concat(e.buffer);
  }

  isLive(sessionId: string): boolean {
    return this.live.has(sessionId);
  }

  destroy(sessionId: string): void {
    const e = this.live.get(sessionId);
    if (!e) return;
    if (e.detachTimer) clearTimeout(e.detachTimer);
    e.stream?.end();
    e.conn.end();
    this.live.delete(sessionId);
  }

  private pushBuffer(e: LiveSession, chunk: Buffer): void {
    e.buffer.push(chunk);
    e.bufferBytes += chunk.length;
    while (e.bufferBytes > MAX_BUFFER_BYTES && e.buffer.length > 0) {
      e.bufferBytes -= e.buffer.shift()!.length;
    }
  }

  // Sondagem descartável pra POST /ssh/hosts/:id/test — nunca fica em cache, nunca abre shell.
  // Aceita qualquer chave de host de propósito (não é TOFU real, é só "dá pra autenticar?"): o
  // TOFU de verdade só acontece quando uma sessão de terminal é aberta via connect().
  async testConnection(host: Pick<SshHost, 'address' | 'port' | 'username' | 'keepalive'>, secret: DecryptedSecret): Promise<{ connected: boolean; message?: string }> {
    const conn = new Client();
    return new Promise((resolve) => {
      conn
        .on('ready', () => {
          conn.end();
          resolve({ connected: true });
        })
        .on('error', (err: Error) => {
          resolve({ connected: false, message: translateSshError(err) });
        })
        .connect({
          host: host.address,
          port: host.port,
          username: host.username,
          readyTimeout: 10000,
          hostVerifier: (_key: Buffer, verify: (valid: boolean) => void) => verify(true),
          ...buildAuthConfig(secret),
        });
    });
  }

  onModuleDestroy(): void {
    for (const sessionId of [...this.live.keys()]) {
      this.destroy(sessionId);
    }
  }
}
