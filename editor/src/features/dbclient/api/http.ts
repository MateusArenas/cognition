import axios, { AxiosError } from 'axios';
import { useSettings } from '@/store/useSettings';
import type { ApiErrorBody } from '../types';

// Um axios só, igual DB-MOBILE.md §2.2 — baseURL e token lidos do useSettings (persistidos,
// tela Ajustes → Backend, ver ConnectionsScreen). Erro sempre normalizado pro formato único do
// backend (services/dbclient thrown como ApiErrorBody), nunca um AxiosError cru chegando na
// tela.
export const http = axios.create({ timeout: 30000 });

http.interceptors.request.use((config) => {
  const { dbApiBaseUrl, dbAuthToken } = useSettings.getState();
  config.baseURL = dbApiBaseUrl;
  if (dbAuthToken) config.headers.Authorization = `Bearer ${dbAuthToken}`;
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (error: AxiosError<ApiErrorBody>) => {
    if (error.response?.data?.message) return Promise.reject(error.response.data);
    return Promise.reject<ApiErrorBody>({ message: error.message || 'Falha de rede.' });
  }
);

export function isApiError(e: unknown): e is ApiErrorBody {
  return typeof e === 'object' && e !== null && 'message' in e;
}
