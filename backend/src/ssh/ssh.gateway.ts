import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { CredentialsService } from './credentials.service';
import { HostsService } from './hosts.service';
import { SessionsService } from './sessions.service';
import { SshManagerService } from './ssh-manager.service';
import { verifyWsToken, type WsUser } from './ws-jwt.util';

interface OpenSessionDto {
  hostId: string;
  cols: number;
  rows: number;
}
interface AttachDto {
  sessionId: string;
}
interface DataDto {
  sessionId: string;
  b64: string;
}
interface ResizeDto {
  sessionId: string;
  cols: number;
  rows: number;
}
interface TrustDto {
  sessionId: string;
  fingerprint: string;
}
interface CloseDto {
  sessionId: string;
}

// Namespace /ssh, autenticado no handshake (client.handshake.auth.token — mesmo access token do
// REST, ver ws-jwt.util.ts). Protocolo completo em docs/20-ssh-mobile.md#protocolo-do-gateway.
// `data` (tecla digitada) nunca usa ack nem `volatile`: perder um `^C` não pode acontecer.
@WebSocketGateway({ namespace: '/ssh', cors: { origin: '*' } })
export class SshGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SshGateway.name);

  constructor(
    private readonly ssh: SshManagerService,
    private readonly hosts: HostsService,
    private readonly credentials: CredentialsService,
    private readonly sessions: SessionsService
  ) {}

  handleConnection(client: Socket): void {
    const token = client.handshake.auth?.token as string | undefined;
    const result = verifyWsToken(token);
    if (!result.ok) {
      client.emit('status', { state: 'error', message: result.message, code: result.code });
      client.disconnect(true);
      return;
    }
    client.data.user = result.user;
    client.data.attached = new Set<string>();
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const attached = (client.data.attached as Set<string> | undefined) ?? new Set<string>();
    await Promise.all(
      [...attached].map(async (sessionId) => {
        this.ssh.detach(sessionId);
        await this.sessions.setStatus(sessionId, 'detached').catch(() => undefined);
      })
    );
  }

  // Socket que nunca entrou na room daquela sessão (não abriu/anexou) não pode mandar tecla,
  // redimensionar ou fechar sessão de outro dono — client.rooms sempre inclui o próprio id do
  // socket além das rooms que ele deu join().
  private ownsRoom(client: Socket, sessionId: string): boolean {
    return client.rooms.has(sessionId);
  }

  @SubscribeMessage('session:open')
  async open(@ConnectedSocket() client: Socket, @MessageBody() dto: OpenSessionDto): Promise<{ sessionId: string } | { error: string }> {
    const user = client.data.user as WsUser;
    const host = await this.hosts.findOwned(dto.hostId, user.id);
    if (!host.credentialId) {
      return { error: 'Host sem credencial configurada.' };
    }

    const session = await this.sessions.create(user.id, host.id, dto.cols, dto.rows);
    client.join(session.id);
    (client.data.attached as Set<string>).add(session.id);
    client.emit('status', { sessionId: session.id, state: 'connecting' });

    const secret = await this.credentials.decryptedSecret(host.credentialId, user.id);

    this.ssh.connect(session.id, {
      ownerId: user.id,
      host,
      secret,
      cols: dto.cols,
      rows: dto.rows,
      onData: (chunk) => client.nsp.to(session.id).emit('data', { sessionId: session.id, b64: chunk.toString('base64') }),
      onStatus: (state, message) => {
        this.sessions.setStatus(session.id, state, message).catch((e: unknown) => this.logger.warn(String(e)));
        if (state === 'open') this.hosts.touchLastConnected(host.id).catch((e: unknown) => this.logger.warn(String(e)));
        client.nsp.to(session.id).emit('status', { sessionId: session.id, state, message });
      },
      onHostKeyUnknown: (info) => client.emit('hostkey:unknown', { sessionId: session.id, ...info }),
      onExit: (code, signal) => {
        this.sessions.close(session.id).catch((e: unknown) => this.logger.warn(String(e)));
        client.nsp.to(session.id).emit('exit', { sessionId: session.id, code, signal });
      },
    });

    return { sessionId: session.id };
  }

  @SubscribeMessage('session:attach')
  async attach(@ConnectedSocket() client: Socket, @MessageBody() { sessionId }: AttachDto): Promise<{ ok: boolean }> {
    const user = client.data.user as WsUser;
    await this.sessions.findOwned(sessionId, user.id);
    client.join(sessionId);
    (client.data.attached as Set<string>).add(sessionId);

    const buffer = this.ssh.replayBuffer(sessionId);
    client.emit('replay', { sessionId, b64: buffer.toString('base64') });

    const live = this.ssh.isLive(sessionId);
    if (live) await this.sessions.setStatus(sessionId, 'open').catch(() => undefined);
    client.emit('status', { sessionId, state: live ? 'open' : 'closed' });
    return { ok: true };
  }

  @SubscribeMessage('data')
  data(@ConnectedSocket() client: Socket, @MessageBody() { sessionId, b64 }: DataDto): void {
    if (!this.ownsRoom(client, sessionId)) return;
    this.ssh.write(sessionId, Buffer.from(b64, 'base64'));
  }

  @SubscribeMessage('resize')
  async resize(@ConnectedSocket() client: Socket, @MessageBody() { sessionId, cols, rows }: ResizeDto): Promise<{ ok: boolean }> {
    if (!this.ownsRoom(client, sessionId)) return { ok: false };
    this.ssh.resize(sessionId, cols, rows);
    await this.sessions.resize(sessionId, cols, rows).catch(() => undefined);
    return { ok: true };
  }

  @SubscribeMessage('hostkey:trust')
  async trust(@ConnectedSocket() client: Socket, @MessageBody() { sessionId, fingerprint }: TrustDto): Promise<{ trusted: boolean }> {
    if (!this.ownsRoom(client, sessionId)) return { trusted: false };
    const trusted = await this.ssh.trustHostKey(sessionId, fingerprint);
    return { trusted };
  }

  @SubscribeMessage('session:close')
  async close(@ConnectedSocket() client: Socket, @MessageBody() { sessionId }: CloseDto): Promise<{ ok: boolean }> {
    if (!this.ownsRoom(client, sessionId)) return { ok: false };
    this.ssh.destroy(sessionId);
    await this.sessions.close(sessionId).catch(() => undefined);
    client.nsp.to(sessionId).emit('status', { sessionId, state: 'closed' });
    client.leave(sessionId);
    (client.data.attached as Set<string>).delete(sessionId);
    return { ok: true };
  }
}
