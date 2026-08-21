import type { Socket } from 'socket.io-client';
import { getSocket } from '@/services/socket';
import type { HostKeyUnknownEvent, StatusEvent } from '../types';

// Namespace /ssh do gateway (backend/src/ssh/ssh.gateway.ts) — protocolo completo documentado em
// docs/20-ssh-mobile.md#protocolo-do-gateway. `data` (tecla digitada) nunca usa ack nem
// volatile: perder um ^C não pode acontecer.
export function getSshSocket(): Socket {
  return getSocket('/ssh');
}

function connectIfNeeded(socket: Socket): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (e: Error) => reject(e));
    socket.connect();
  });
}

// Sem isto, um host inalcançável (porta filtrada, TCP que nunca recusa nem aceita) travava o
// spinner de "conectando" pra sempre — nada no protocolo garantia um `status:error` chegando em
// tempo hábil, e a Promise de openSession() nunca resolvia nem rejeitava. Achado ao vivo:
// conectar num host de verdade e o app ficar preso no spinner sem nenhum erro. Não conta o tempo
// que o usuário leva decidindo o alerta de TOFU (`onHostKeyPrompt`) — só o handshake em si.
const CONNECT_TIMEOUT_MS = 25000;

// Abre uma sessão nova e só resolve quando ela está DE VERDADE aberta (shell pronto), nunca
// antes — é o que evita a corrida de navegar pra tela do terminal e perder um evento
// (`hostkey:unknown`/`status`) que já tinha disparado antes da tela montar e assinar os
// listeners. O TOFU (confiar na chave do host) acontece aqui dentro, síncrono com essa espera:
// `onHostKeyPrompt` mostra o alerta e devolve se o usuário confiou.
export async function openSession(hostId: string, onHostKeyPrompt: (info: { fingerprint: string; keyType: string }) => Promise<boolean>): Promise<string> {
  const socket = getSshSocket();
  await connectIfNeeded(socket);

  const ack = (await socket.timeout(10000).emitWithAck('session:open', { hostId, cols: 80, rows: 24 })) as { sessionId?: string; error?: string };
  if (!ack.sessionId) throw new Error(ack.error ?? 'Não foi possível abrir a sessão.');
  const sessionId = ack.sessionId;

  return new Promise<string>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    function armTimer() {
      clearTimer();
      timer = setTimeout(() => {
        cleanup();
        socket.emit('session:close', { sessionId });
        reject(new Error('Tempo esgotado tentando conectar — host pode estar inalcançável.'));
      }, CONNECT_TIMEOUT_MS);
    }
    function clearTimer() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    }

    const onHostKeyUnknown = (p: HostKeyUnknownEvent) => {
      if (p.sessionId !== sessionId) return;
      clearTimer(); // esperar o usuário decidir não conta como "travado"
      onHostKeyPrompt({ fingerprint: p.fingerprint, keyType: p.keyType })
        .then((trust) => {
          if (!trust) {
            cleanup();
            socket.emit('session:close', { sessionId });
            reject(new Error('Conexão recusada — chave do host não confiada.'));
            return;
          }
          socket.emit('hostkey:trust', { sessionId, fingerprint: p.fingerprint });
          armTimer(); // volta a vigiar até o status:open chegar
        })
        .catch((e: unknown) => {
          cleanup();
          reject(e instanceof Error ? e : new Error(String(e)));
        });
    };
    const onStatus = (p: StatusEvent) => {
      if (p.sessionId !== sessionId) return;
      if (p.state === 'open') {
        cleanup();
        resolve(sessionId);
      } else if (p.state === 'error') {
        cleanup();
        reject(new Error(p.message ?? 'Falha ao conectar.'));
      }
    };
    function cleanup() {
      clearTimer();
      socket.off('hostkey:unknown', onHostKeyUnknown);
      socket.off('status', onStatus);
    }
    socket.on('hostkey:unknown', onHostKeyUnknown);
    socket.on('status', onStatus);
    armTimer();
  });
}

// Reanexa numa sessão que já está aberta (ou detached) — sem TOFU, a chave já foi confiada
// quando a sessão abriu a primeira vez. Usado por SessionsScreen.
export async function attachSession(sessionId: string): Promise<void> {
  const socket = getSshSocket();
  await connectIfNeeded(socket);
  await socket.timeout(10000).emitWithAck('session:attach', { sessionId });
}
