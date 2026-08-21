export interface AuthUser {
  id: string;
  email: string;
  username: string | null;
  name: string;
  roles: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends AuthTokens {
  user: AuthUser;
}

export interface RegisterInput {
  email: string;
  username: string;
  name: string;
  password: string;
}
