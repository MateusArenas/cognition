import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useAuthStore, type SavedAccount } from '@/store/useAuthStore';
import * as authApi from './api';
import type { AuthUser, LoginResult, RegisterInput } from './types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  accounts: SavedAccount[];
  activeAccountId: string | null;
  login: (identifier: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Tenta trocar pra outra conta salva — token válido, ou refresh, ou re-login silencioso com
   * a senha salva. `false` = nenhum dos três funcionou (a conta continua salva, só não ativa). */
  switchAccount: (id: string) => Promise<boolean>;
  removeAccount: (id: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  /** Roda uma vez, na AppGate — hidrata o SecureStore e valida a conta ativa (GET /auth/me,
   * com refresh automático se precisar) antes da splash liberar a tela. */
  bootstrap: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() precisa de um <AuthProvider> por cima na árvore.');
  return ctx;
}

function toSavedAccount(result: LoginResult, password: string, identifier: string): SavedAccount {
  return {
    id: result.user.id,
    identifier,
    email: result.user.email,
    username: result.user.username,
    name: result.user.name,
    password,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    updatedAt: Date.now(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const accountsMap = useAuthStore((s) => s.accounts);
  const activeAccountId = useAuthStore((s) => s.activeAccountId);
  const hydrate = useAuthStore((s) => s.hydrate);
  const upsertAccount = useAuthStore((s) => s.upsertAccount);
  const setActiveAccount = useAuthStore((s) => s.setActiveAccount);
  const removeAccountFromStore = useAuthStore((s) => s.removeAccount);
  const [bootstrapped, setBootstrapped] = useState(false);

  // Tenta, nesta ordem: accessToken salvo (GET /auth/me) → refresh automático (já embutido no
  // interceptor de @/api/http.ts, transparente aqui) → re-login silencioso com a senha salva
  // (decisão consciente de guardá-la — ver docs/18-autenticacao.md). Usado tanto pelo
  // bootstrap() da splash quanto por switchAccount() — mesmo caminho, sem duplicar lógica.
  const resolveSession = useCallback(
    async (id: string): Promise<boolean> => {
      const account = useAuthStore.getState().accounts[id];
      if (!account) return false;
      await setActiveAccount(id);
      try {
        await authApi.me();
        return true;
      } catch {
        try {
          const result = await authApi.login(account.identifier, account.password);
          await upsertAccount(toSavedAccount(result, account.password, account.identifier));
          return true;
        } catch {
          await setActiveAccount(null);
          return false;
        }
      }
    },
    [setActiveAccount, upsertAccount]
  );

  const bootstrap = useCallback(async () => {
    await hydrate();
    const { activeAccountId: id } = useAuthStore.getState();
    if (id) await resolveSession(id);
    setBootstrapped(true);
  }, [hydrate, resolveSession]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const result = await authApi.login(identifier, password);
      await upsertAccount(toSavedAccount(result, password, identifier));
    },
    [upsertAccount]
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const result = await authApi.register(input);
      await upsertAccount(toSavedAccount(result, input.password, input.email));
    },
    [upsertAccount]
  );

  const logout = useCallback(async () => {
    const { activeAccountId: id, accounts } = useAuthStore.getState();
    if (!id) return;
    const account = accounts[id];
    if (account) {
      try {
        await authApi.logout(account.refreshToken);
      } catch {
        // Melhor esforço — se a rede cair no meio, ainda assim esquece a conta localmente.
      }
    }
    await removeAccountFromStore(id);
  }, [removeAccountFromStore]);

  const switchAccount = useCallback((id: string) => resolveSession(id), [resolveSession]);

  const removeAccount = useCallback((id: string) => removeAccountFromStore(id), [removeAccountFromStore]);

  const forgotPassword = useCallback((email: string) => authApi.forgotPassword(email), []);
  const resetPassword = useCallback((token: string, newPassword: string) => authApi.resetPassword(token, newPassword), []);

  const activeAccount = activeAccountId ? accountsMap[activeAccountId] : null;
  const status: AuthStatus = !bootstrapped ? 'loading' : activeAccount ? 'authenticated' : 'unauthenticated';
  const user: AuthUser | null = activeAccount
    ? { id: activeAccount.id, email: activeAccount.email, username: activeAccount.username, name: activeAccount.name, roles: [] }
    : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      accounts: Object.values(accountsMap),
      activeAccountId,
      login,
      register,
      logout,
      switchAccount,
      removeAccount,
      forgotPassword,
      resetPassword,
      bootstrap,
    }),
    [status, user, accountsMap, activeAccountId, login, register, logout, switchAccount, removeAccount, forgotPassword, resetPassword, bootstrap]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
