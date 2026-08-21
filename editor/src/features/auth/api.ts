import { http } from '@/api/http';
import type { AuthUser, LoginResult, RegisterInput } from './types';

// Uma função por rota, tipada — mesma convenção de features/dbclient/api/services.ts.
export async function register(input: RegisterInput): Promise<LoginResult> {
  const { data } = await http.post<LoginResult>('/auth/register', input);
  return data;
}

export async function login(identifier: string, password: string): Promise<LoginResult> {
  const { data } = await http.post<LoginResult>('/auth/login', { identifier, password });
  return data;
}

export async function refresh(refreshToken: string): Promise<LoginResult> {
  const { data } = await http.post<LoginResult>('/auth/refresh', { refreshToken });
  return data;
}

export async function me(): Promise<AuthUser> {
  const { data } = await http.get<AuthUser>('/auth/me');
  return data;
}

export async function logout(refreshToken: string): Promise<void> {
  await http.post('/auth/logout', { refreshToken });
}

export async function forgotPassword(email: string): Promise<void> {
  await http.post('/auth/forgot-password', { email });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await http.post('/auth/reset-password', { token, newPassword });
}
