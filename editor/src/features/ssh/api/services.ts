import { http } from '@/api/http';
import { R } from './routes';
import type { SshAuthMethod, SshCredential, SshCredentialKind, SshHost, SshKnownHost, SshSession, SshSnippet } from '../types';

// Uma função por rota, tipada — mesmo padrão de features/dbclient/api/services.ts.

export interface HostInput {
  label: string;
  address: string;
  port?: number;
  username: string;
  authMethod: SshAuthMethod;
  credentialId?: string;
  groupName?: string;
  tags?: string[];
  color?: string;
  keepalive?: boolean;
  startupCommand?: string;
}

export async function listHosts(): Promise<SshHost[]> {
  const { data } = await http.get<SshHost[]>(R.hosts());
  return data;
}

export async function getHost(id: string): Promise<SshHost> {
  const { data } = await http.get<SshHost>(R.host(id));
  return data;
}

export async function createHost(input: HostInput): Promise<SshHost> {
  const { data } = await http.post<SshHost>(R.hosts(), input);
  return data;
}

export async function updateHost(id: string, input: Partial<HostInput>): Promise<SshHost> {
  const { data } = await http.patch<SshHost>(R.host(id), input);
  return data;
}

export async function deleteHost(id: string): Promise<void> {
  await http.delete(R.host(id));
}

export async function testHost(id: string): Promise<{ connected: boolean; message?: string }> {
  const { data } = await http.post(R.hostTest(id));
  return data;
}

export interface ImportCredentialInput {
  name: string;
  kind: SshCredentialKind;
  privateKey?: string;
  passphrase?: string;
  publicKey?: string;
  password?: string;
}

export async function listCredentials(): Promise<SshCredential[]> {
  const { data } = await http.get<SshCredential[]>(R.credentials());
  return data;
}

export async function importCredential(input: ImportCredentialInput): Promise<SshCredential> {
  const { data } = await http.post<SshCredential>(R.credentials(), input);
  return data;
}

export async function generateCredential(name: string): Promise<SshCredential> {
  const { data } = await http.post<SshCredential>(R.credentialsGenerate(), { name });
  return data;
}

// `kind` nunca vai nesse input — não muda depois de criada (backend ignora se vier). Campo de
// segredo em branco/ausente mantém o que já tem, nunca some.
export type UpdateCredentialInput = Omit<ImportCredentialInput, 'kind'>;

export async function updateCredential(id: string, input: Partial<UpdateCredentialInput>): Promise<SshCredential> {
  const { data } = await http.patch<SshCredential>(R.credential(id), input);
  return data;
}

export async function deleteCredential(id: string): Promise<void> {
  await http.delete(R.credential(id));
}

export async function listKnownHosts(): Promise<SshKnownHost[]> {
  const { data } = await http.get<SshKnownHost[]>(R.knownHosts());
  return data;
}

export async function forgetKnownHost(id: string): Promise<void> {
  await http.delete(R.knownHost(id));
}

export interface SnippetInput {
  name: string;
  command: string;
  tag?: string;
  requireConfirm?: boolean;
}

export async function listSnippets(): Promise<SshSnippet[]> {
  const { data } = await http.get<SshSnippet[]>(R.snippets());
  return data;
}

export async function createSnippet(input: SnippetInput): Promise<SshSnippet> {
  const { data } = await http.post<SshSnippet>(R.snippets(), input);
  return data;
}

export async function updateSnippet(id: string, input: Partial<SnippetInput>): Promise<SshSnippet> {
  const { data } = await http.patch<SshSnippet>(R.snippet(id), input);
  return data;
}

export async function deleteSnippet(id: string): Promise<void> {
  await http.delete(R.snippet(id));
}

export async function listSessions(): Promise<SshSession[]> {
  const { data } = await http.get<SshSession[]>(R.sessions());
  return data;
}

export async function closeSession(id: string): Promise<void> {
  await http.delete(R.session(id));
}
