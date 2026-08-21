// Contratos que trafegam nas rotas/eventos do backend (backend/src/ssh/**, ver
// docs/20-ssh-mobile.md). Espelha as respostas de verdade — mudou lá, muda aqui, é o único lugar
// que sabe a forma do JSON (nenhuma tela monta objeto solto), mesma regra de features/dbclient/types.ts.

export type SshAuthMethod = 'key' | 'password';

export interface SshHost {
  id: string;
  label: string;
  address: string;
  port: number;
  username: string;
  authMethod: SshAuthMethod;
  credentialId: string | null;
  groupName: string | null;
  tags: string[];
  color: string;
  keepalive: boolean;
  startupCommand: string | null;
  lastConnectedAt: string | null;
}

export type SshCredentialKind = 'key' | 'password';

export interface SshCredential {
  id: string;
  name: string;
  kind: SshCredentialKind;
  keyType: string | null;
  publicKey: string | null;
  fingerprintSha256: string | null;
  hasPassphrase: boolean;
}

export interface SshKnownHost {
  id: string;
  address: string;
  port: number;
  keyType: string;
  fingerprintSha256: string;
  trustedAt: string;
}

export interface SshSnippet {
  id: string;
  name: string;
  command: string;
  tag: string | null;
  requireConfirm: boolean;
}

export type SshSessionStatus = 'connecting' | 'open' | 'detached' | 'closed' | 'error';

export interface SshSession {
  id: string;
  ownerId: string;
  hostId: string | null;
  status: SshSessionStatus;
  cols: number;
  rows: number;
  errorMessage: string | null;
  openedAt: string;
  closedAt: string | null;
}

// --- eventos do gateway /ssh --------------------------------------------------------------

export interface StatusEvent {
  sessionId?: string;
  state: 'connecting' | 'open' | 'closed' | 'error';
  message?: string;
  code?: string;
}
export interface HostKeyUnknownEvent {
  sessionId: string;
  fingerprint: string;
  keyType: string;
}
export interface DataEvent {
  sessionId: string;
  b64: string;
}
export interface ReplayEvent {
  sessionId: string;
  b64: string;
}
export interface ExitEvent {
  sessionId: string;
  code: number | null;
  signal?: string;
}
