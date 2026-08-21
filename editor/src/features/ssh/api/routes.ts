// Mapa único de rotas — nenhuma tela monta URL na mão, mesmo padrão de features/dbclient/api/routes.ts.
function enc(v: string): string {
  return encodeURIComponent(v);
}

export const R = {
  hosts: () => `/ssh/hosts`,
  host: (id: string) => `/ssh/hosts/${enc(id)}`,
  hostTest: (id: string) => `/ssh/hosts/${enc(id)}/test`,
  credentials: () => `/ssh/credentials`,
  credentialsGenerate: () => `/ssh/credentials/generate`,
  credential: (id: string) => `/ssh/credentials/${enc(id)}`,
  knownHosts: () => `/ssh/known-hosts`,
  knownHost: (id: string) => `/ssh/known-hosts/${enc(id)}`,
  snippets: () => `/ssh/snippets`,
  snippet: (id: string) => `/ssh/snippets/${enc(id)}`,
  sessions: () => `/ssh/sessions`,
  session: (id: string) => `/ssh/sessions/${enc(id)}`,
} as const;
