import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openSession } from './sshSocket';

// `openSession()` fala com um socket.io de verdade em produção — aqui, uma fake mínima
// (EventEmitter já dá on/off/emit de graça) só precisa responder `timeout().emitWithAck()` e
// permitir disparar 'status'/'hostkey:unknown' como o gateway faria.
class FakeSocket extends EventEmitter {
  connected = true;
  connect = vi.fn();
  emittedClose: unknown[] = [];
  emittedTrust: unknown[] = [];
  ackResult: { sessionId?: string; error?: string } = { sessionId: 'sess-1' };

  timeout() {
    return { emitWithAck: async () => this.ackResult };
  }

  emit(event: string, ...args: unknown[]): boolean {
    if (event === 'session:close') this.emittedClose.push(args[0]);
    if (event === 'hostkey:trust') this.emittedTrust.push(args[0]);
    return super.emit(event, ...args);
  }
}

const fakeSocket = new FakeSocket();
vi.mock('@/services/socket', () => ({ getSocket: () => fakeSocket }));

describe('openSession — timeout do handshake de conexão', () => {
  beforeEach(() => {
    fakeSocket.removeAllListeners();
    fakeSocket.connected = true;
    fakeSocket.emittedClose = [];
    fakeSocket.emittedTrust = [];
    fakeSocket.ackResult = { sessionId: 'sess-1' };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolve normalmente quando status:open chega antes do timeout', async () => {
    const promise = openSession('host-1', async () => true);
    // openSession() ainda tem 2 `await` internos (connectIfNeeded, emitWithAck) antes de
    // registrar os listeners — sem esperar esses microtasks passarem, o emit() abaixo dispara
    // num socket que ainda não tem ninguém ouvindo 'status'.
    await vi.advanceTimersByTimeAsync(0);
    fakeSocket.emit('status', { sessionId: 'sess-1', state: 'open' });
    await expect(promise).resolves.toBe('sess-1');
  });

  it('rejeita e fecha a sessão se o handshake nunca responder (host travado, sem status nem hostkey:unknown)', async () => {
    const promise = openSession('host-1', async () => true);
    const assertion = expect(promise).rejects.toThrow(/Tempo esgotado/);
    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
    expect(fakeSocket.emittedClose).toEqual([{ sessionId: 'sess-1' }]);
  });

  it('NÃO conta o tempo que o usuário leva decidindo o alerta de TOFU', async () => {
    let resolvePrompt: ((v: boolean) => void) | undefined;
    const onPrompt = vi.fn(() => new Promise<boolean>((resolve) => (resolvePrompt = resolve)));

    const promise = openSession('host-1', onPrompt);
    await vi.advanceTimersByTimeAsync(0); // deixa os listeners internos serem registrados antes do emit abaixo
    fakeSocket.emit('hostkey:unknown', { sessionId: 'sess-1', fingerprint: 'SHA256:x', keyType: 'ssh-ed25519' });
    await vi.advanceTimersByTimeAsync(0); // deixa o .then() de onHostKeyPrompt() se pendurar

    // avança bem além do CONNECT_TIMEOUT_MS enquanto o alerta ainda está "aberto" — não pode rejeitar
    await vi.advanceTimersByTimeAsync(60000);
    expect(fakeSocket.emittedClose).toEqual([]);

    resolvePrompt?.(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fakeSocket.emittedTrust).toEqual([{ sessionId: 'sess-1', fingerprint: 'SHA256:x' }]);

    fakeSocket.emit('status', { sessionId: 'sess-1', state: 'open' });
    await expect(promise).resolves.toBe('sess-1');
  });

  it('rejeita se status:error chegar', async () => {
    const promise = openSession('host-1', async () => true);
    // captura a rejeição assim que ela existir, antes de qualquer outra coisa poder virar unhandled rejection
    const assertion = expect(promise).rejects.toThrow('ECONNREFUSED');
    await vi.advanceTimersByTimeAsync(0);
    fakeSocket.emit('status', { sessionId: 'sess-1', state: 'error', message: 'ECONNREFUSED' });
    await assertion;
  });
});
