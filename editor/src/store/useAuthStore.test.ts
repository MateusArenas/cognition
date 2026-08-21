import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
  setItemAsync: vi.fn((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: vi.fn((key: string) => {
    store.delete(key);
    return Promise.resolve();
  }),
}));

import { useAuthStore, type SavedAccount } from './useAuthStore';

function makeAccount(id: string, overrides: Partial<SavedAccount> = {}): SavedAccount {
  return {
    id,
    identifier: `${id}@exemplo.com`,
    email: `${id}@exemplo.com`,
    username: null,
    name: `Conta ${id}`,
    password: 'senha-forte',
    accessToken: `access-${id}`,
    refreshToken: `refresh-${id}`,
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('useAuthStore', () => {
  beforeEach(() => {
    store.clear();
    useAuthStore.setState({ accounts: {}, activeAccountId: null, hydrated: false });
  });

  it('hydrate() sem nada salvo termina sem contas e hydrated=true', async () => {
    await useAuthStore.getState().hydrate();
    const state = useAuthStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.accounts).toEqual({});
    expect(state.activeAccountId).toBeNull();
  });

  it('upsertAccount() persiste em UMA CHAVE POR CONTA, não um blob único', async () => {
    await useAuthStore.getState().upsertAccount(makeAccount('a'));
    expect(store.has('editor.auth.account.a')).toBe(true);
    expect(store.has('editor.auth.index.v1')).toBe(true);
    // O índice guarda só ids/ativa — não duplica os dados da conta.
    const index = JSON.parse(store.get('editor.auth.index.v1')!);
    expect(index.accountIds).toEqual(['a']);
    expect(index.activeAccountId).toBe('a');
  });

  it('upsertAccount() de uma segunda conta convive com a primeira e vira a ativa', async () => {
    await useAuthStore.getState().upsertAccount(makeAccount('a'));
    await useAuthStore.getState().upsertAccount(makeAccount('b'));
    const state = useAuthStore.getState();
    expect(Object.keys(state.accounts).sort()).toEqual(['a', 'b']);
    expect(state.activeAccountId).toBe('b');
  });

  it('hydrate() depois de reabrir o app recompõe as múltiplas contas salvas', async () => {
    await useAuthStore.getState().upsertAccount(makeAccount('a'));
    await useAuthStore.getState().upsertAccount(makeAccount('b'));
    useAuthStore.setState({ accounts: {}, activeAccountId: null, hydrated: false });

    await useAuthStore.getState().hydrate();
    const state = useAuthStore.getState();
    expect(Object.keys(state.accounts).sort()).toEqual(['a', 'b']);
    expect(state.activeAccountId).toBe('b');
  });

  it('setActiveAccount() troca qual conta está ativa sem mexer nas outras', async () => {
    await useAuthStore.getState().upsertAccount(makeAccount('a'));
    await useAuthStore.getState().upsertAccount(makeAccount('b'));
    await useAuthStore.getState().setActiveAccount('a');
    expect(useAuthStore.getState().activeAccountId).toBe('a');
    expect(Object.keys(useAuthStore.getState().accounts).sort()).toEqual(['a', 'b']);
  });

  it('updateTokens() atualiza só accessToken/refreshToken, preserva senha/identifier', async () => {
    await useAuthStore.getState().upsertAccount(makeAccount('a'));
    await useAuthStore.getState().updateTokens('a', { accessToken: 'novo-access', refreshToken: 'novo-refresh' });
    const account = useAuthStore.getState().accounts.a;
    expect(account.accessToken).toBe('novo-access');
    expect(account.refreshToken).toBe('novo-refresh');
    expect(account.password).toBe('senha-forte');
    expect(account.identifier).toBe('a@exemplo.com');
  });

  it('removeAccount() apaga a chave dedicada da conta e limpa a conta ativa se era ela', async () => {
    await useAuthStore.getState().upsertAccount(makeAccount('a'));
    await useAuthStore.getState().removeAccount('a');
    expect(store.has('editor.auth.account.a')).toBe(false);
    expect(useAuthStore.getState().accounts.a).toBeUndefined();
    expect(useAuthStore.getState().activeAccountId).toBeNull();
  });

  it('removeAccount() de uma conta que não é a ativa não mexe em qual está ativa', async () => {
    await useAuthStore.getState().upsertAccount(makeAccount('a'));
    await useAuthStore.getState().upsertAccount(makeAccount('b'));
    await useAuthStore.getState().removeAccount('a');
    expect(useAuthStore.getState().activeAccountId).toBe('b');
    expect(useAuthStore.getState().accounts.b).toBeDefined();
  });
});
