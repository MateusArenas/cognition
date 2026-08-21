import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { Alert } from 'react-native';
import { useAuthStore } from '@/store/useAuthStore';

// Instância única do app inteiro (não mais só "do cliente de banco" — a autenticação passou a
// travar o app inteiro, ver docs/18-autenticacao.md). Erro sempre normalizado pro formato único
// do backend (`ApiErrorBody`), nunca um AxiosError cru chegando na tela.
export interface ApiErrorBody {
  message: string;
  code?: string;
  position?: number;
  hint?: string;
  index?: number;
  affected?: number;
}

// Endereço fixo do backend — não é mais configurável pelo usuário (tirado da tela de Login a
// pedido explícito: um único backend, sem precisar digitar/lembrar endereço nenhum). Vem de
// EXPO_PUBLIC_API_URL, inlinado pelo Metro a partir do .env do ambiente certo (.env.development
// local, .env.hml/.env.production ao publicar — ver docs/02-setup-e-estrutura.md e os scripts
// "update:hml"/"update:production" em package.json). Sem alternativa hardcoded aqui de propósito
// — um ambiente sem `.env` configurado tem que quebrar visivelmente, não apontar por acidente
// pro backend de outro ambiente.
const envApiUrl = process.env.EXPO_PUBLIC_API_URL;
if (!envApiUrl) {
  const msg = 'EXPO_PUBLIC_API_URL não definida para este ambiente — falta o .env correspondente (ver docs/02-setup-e-estrutura.md). O app não vai conseguir falar com o backend.';
  console.error('[http]', msg);
  Alert.alert('Configuração ausente', msg);
}

export const API_BASE_URL = `${envApiUrl ?? ''}/api/v1`;

export const http = axios.create({ baseURL: API_BASE_URL, timeout: 30000 });

// Instância crua, SEM interceptors — só usada pra chamar /auth/refresh. Se passasse pelo
// interceptor de resposta de `http` abaixo, uma falha de refresh tentaria disparar outro
// refresh (recursivo).
const refreshHttp = axios.create({ baseURL: API_BASE_URL, timeout: 30000 });

http.interceptors.request.use((config) => {
  const { accounts, activeAccountId } = useAuthStore.getState();
  const account = activeAccountId ? accounts[activeAccountId] : null;
  if (account?.accessToken) config.headers.Authorization = `Bearer ${account.accessToken}`;
  return config;
});

// Primitivo reaproveitado tanto pelo interceptor abaixo (só a conta ATIVA) quanto por
// `features/auth/AuthContext.tsx` (`resolveSession`, que pode reautenticar QUALQUER conta
// salva — trocar de conta, checagem da splash) — uma única chamada de rede pro /auth/refresh,
// nunca duplicada.
export async function refreshTokensFor(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const res = await refreshHttp.post('/auth/refresh', { refreshToken });
    return { accessToken: res.data.accessToken, refreshToken: res.data.refreshToken };
  } catch {
    return null;
  }
}

// Um único refresh em voo por vez — se N requisições falharem com TOKEN_EXPIRED ao mesmo
// tempo, todas esperam a MESMA promise em vez de disparar N chamadas de refresh (que
// rotacionaria o refresh token N vezes, invalidando as próprias requisições concorrentes).
let refreshPromise: Promise<string | null> | null = null;

async function refreshActiveAccount(): Promise<string | null> {
  const { accounts, activeAccountId, updateTokens, setActiveAccount } = useAuthStore.getState();
  const account = activeAccountId ? accounts[activeAccountId] : null;
  if (!account) return null;

  const result = await refreshTokensFor(account.refreshToken);
  if (!result) {
    // refreshToken também morreu — limpa a conta ativa. O `Stack.Protected` (app/_layout.tsx)
    // reage sozinho ao `status` virar "unauthenticated", sem navegação imperativa aqui.
    await setActiveAccount(null);
    return null;
  }
  await updateTokens(account.id, result);
  return result.accessToken;
}

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as (InternalAxiosRequestConfig & { _retriedAfterRefresh?: boolean }) | undefined;
    const code = error.response?.data?.code;

    if (error.response?.status === 401 && code === 'TOKEN_EXPIRED' && config && !config._retriedAfterRefresh) {
      config._retriedAfterRefresh = true;
      refreshPromise ??= refreshActiveAccount().finally(() => {
        refreshPromise = null;
      });
      const newAccessToken = await refreshPromise;
      if (newAccessToken) {
        config.headers.Authorization = `Bearer ${newAccessToken}`;
        return http(config);
      }
    }

    if (error.response?.data?.message) return Promise.reject(error.response.data);
    return Promise.reject<ApiErrorBody>({ message: error.message || 'Falha de rede.' });
  }
);

export function isApiError(e: unknown): e is ApiErrorBody {
  return typeof e === 'object' && e !== null && 'message' in e;
}
