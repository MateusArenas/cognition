import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL, refreshTokensFor } from '@/api/http';
import { useAuthStore } from '@/store/useAuthStore';

// Mesmo host do REST, sem o sufixo /api/v1 — namespaces de gateway do Nest vivem na raiz do
// socket.io, não atrás do prefixo HTTP (ver docs/20-ssh-mobile.md).
const SOCKET_BASE_URL = API_BASE_URL.replace(/\/api\/v\d+$/, '');

function currentAccessToken(): string | undefined {
  const { accounts, activeAccountId } = useAuthStore.getState();
  const account = activeAccountId ? accounts[activeAccountId] : null;
  return account?.accessToken;
}

async function refreshAndReconnect(socket: Socket): Promise<void> {
  const { accounts, activeAccountId, updateTokens } = useAuthStore.getState();
  const account = activeAccountId ? accounts[activeAccountId] : null;
  if (!account) return;
  const result = await refreshTokensFor(account.refreshToken);
  if (!result) return;
  await updateTokens(account.id, result);
  socket.connect(); // reconecta com o token novo, relido pela função `auth` abaixo
}

const sockets = new Map<string, Socket>();

// Uma instância de socket por namespace, compartilhada pelo app inteiro — pedido explícito do
// usuário: não é só do cliente SSH, qualquer feature futura que precise de tempo real chama
// getSocket('/algo') em vez de reimplementar conexão/reconexão/token do zero.
//
// `auth` como FUNÇÃO, não objeto — reavaliada a CADA reconexão. Com objeto, o socket reconecta
// pra sempre com o token velho e expirado (detalhe documentado na spec de referência do SSH,
// vale pra qualquer gateway, não só o /ssh).
export function getSocket(namespace: string): Socket {
  const cached = sockets.get(namespace);
  if (cached) return cached;

  const socket: Socket = io(`${SOCKET_BASE_URL}${namespace}`, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    auth: (cb) => cb({ token: currentAccessToken() }),
  });

  // Dois jeitos de um gateway sinalizar token inválido/vencido: um middleware de auth que
  // rejeita a conexão (dispara 'connect_error' de verdade, o caminho idiomático do socket.io) ou
  // — o que o gateway /ssh faz hoje, ver ssh.gateway.ts#handleConnection — aceitar a conexão e
  // emitir 'status' sem sessionId (nenhuma sessão de terminal ainda existe) antes de desconectar.
  // Os dois casos tentam UM refresh e reconectam com o token novo.
  socket.on('connect_error', (err: Error) => {
    if (err.message === 'TOKEN_EXPIRED' || err.message === 'UNAUTHENTICATED') void refreshAndReconnect(socket);
  });
  socket.on('status', (payload: { sessionId?: string; code?: string }) => {
    if (!payload.sessionId && (payload.code === 'TOKEN_EXPIRED' || payload.code === 'UNAUTHENTICATED')) void refreshAndReconnect(socket);
  });

  sockets.set(namespace, socket);
  return socket;
}

export function closeSocket(namespace: string): void {
  const socket = sockets.get(namespace);
  if (!socket) return;
  socket.close();
  sockets.delete(namespace);
}
