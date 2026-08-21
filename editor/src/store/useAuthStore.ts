import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const INDEX_KEY = 'editor.auth.index.v1';
const accountKey = (id: string) => `editor.auth.account.${id}`;

// Uma conta salva por chave própria do SecureStore (não um blob único com todas) — o Android
// Keystore tem um teto de ~2KB por valor, e cada conta carrega dois JWTs + a senha; com mais de
// duas ou três contas um blob único estouraria esse limite. `INDEX_KEY` só guarda os ids +
// qual está ativa; o resto vive espalhado, uma chave por conta.
export interface SavedAccount {
  id: string;
  /** E-mail ou username DIGITADO pra logar — reusado no re-login silencioso (pode ser um dos dois). */
  identifier: string;
  /** E-mail de verdade, como o backend devolve — sempre presente, independente do que foi digitado. */
  email: string;
  username: string | null;
  name: string;
  // Guardada de propósito (decisão consciente, não descuido — ver docs/18-autenticacao.md):
  // permite re-autenticar sozinho mesmo depois do refreshToken vencer. Nunca logar, nunca
  // devolver em mensagem de erro/toast.
  password: string;
  accessToken: string;
  refreshToken: string;
  updatedAt: number;
}

interface AuthIndex {
  accountIds: string[];
  activeAccountId: string | null;
}

interface AuthStoreState {
  accounts: Record<string, SavedAccount>;
  activeAccountId: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  upsertAccount: (account: SavedAccount) => Promise<void>;
  setActiveAccount: (id: string | null) => Promise<void>;
  updateTokens: (id: string, tokens: { accessToken: string; refreshToken: string }) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
}

async function readIndex(): Promise<AuthIndex> {
  const raw = await SecureStore.getItemAsync(INDEX_KEY);
  if (!raw) return { accountIds: [], activeAccountId: null };
  try {
    return JSON.parse(raw) as AuthIndex;
  } catch {
    return { accountIds: [], activeAccountId: null };
  }
}

function writeIndex(index: AuthIndex): Promise<void> {
  return SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(index));
}

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  accounts: {},
  activeAccountId: null,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const index = await readIndex();
      const entries = await Promise.all(
        index.accountIds.map(async (id) => {
          const raw = await SecureStore.getItemAsync(accountKey(id));
          if (!raw) return null;
          try {
            return JSON.parse(raw) as SavedAccount;
          } catch {
            return null;
          }
        })
      );
      const accounts: Record<string, SavedAccount> = {};
      for (const account of entries) if (account) accounts[account.id] = account;
      // Se a conta ativa sumiu de algum jeito (corrompida/apagada por fora), cai pra nenhuma —
      // nunca aponta pra uma conta que não existe mais.
      const activeAccountId = index.activeAccountId && accounts[index.activeAccountId] ? index.activeAccountId : null;
      set({ accounts, activeAccountId, hydrated: true });
    } catch {
      set({ accounts: {}, activeAccountId: null, hydrated: true });
    }
  },

  upsertAccount: async (account) => {
    await SecureStore.setItemAsync(accountKey(account.id), JSON.stringify(account));
    const accounts = { ...get().accounts, [account.id]: account };
    const index = await readIndex();
    const accountIds = index.accountIds.includes(account.id) ? index.accountIds : [...index.accountIds, account.id];
    await writeIndex({ accountIds, activeAccountId: account.id });
    set({ accounts, activeAccountId: account.id });
  },

  setActiveAccount: async (id) => {
    const index = await readIndex();
    await writeIndex({ ...index, activeAccountId: id });
    set({ activeAccountId: id });
  },

  updateTokens: async (id, tokens) => {
    const existing = get().accounts[id];
    if (!existing) return;
    const updated: SavedAccount = { ...existing, ...tokens, updatedAt: Date.now() };
    await SecureStore.setItemAsync(accountKey(id), JSON.stringify(updated));
    set({ accounts: { ...get().accounts, [id]: updated } });
  },

  removeAccount: async (id) => {
    await SecureStore.deleteItemAsync(accountKey(id));
    const index = await readIndex();
    const accountIds = index.accountIds.filter((x) => x !== id);
    const activeAccountId = index.activeAccountId === id ? null : index.activeAccountId;
    await writeIndex({ accountIds, activeAccountId });
    const accounts = { ...get().accounts };
    delete accounts[id];
    set({ accounts, activeAccountId: get().activeAccountId === id ? null : get().activeAccountId });
  },
}));
