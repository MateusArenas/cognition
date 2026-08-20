// Mapa único de rotas — nenhuma tela monta URL na mão (DB-MOBILE.md §2.3).
function enc(v: string): string {
  return encodeURIComponent(v);
}

export const R = {
  login: () => `/auth/login`,
  drivers: () => `/drivers`,
  connections: () => `/connections`,
  connectionTest: () => `/connections/test`,
  connection: (id: string) => `/connections/${enc(id)}`,
  connect: (id: string) => `/connections/${enc(id)}/connect`,
  disconnect: (id: string) => `/connections/${enc(id)}/disconnect`,
  status: (id: string) => `/connections/${enc(id)}/status`,
  databases: (id: string) => `/connections/${enc(id)}/databases`,
  schemas: (id: string) => `/connections/${enc(id)}/schemas`,
  tables: (id: string) => `/connections/${enc(id)}/tables`,
  table: (id: string, t: string) => `/connections/${enc(id)}/tables/${enc(t)}`,
  tableDdl: (id: string, t: string) => `/connections/${enc(id)}/tables/${enc(t)}/ddl`,
  tableCount: (id: string, t: string) => `/connections/${enc(id)}/tables/${enc(t)}/count`,
  rows: (id: string, t: string) => `/connections/${enc(id)}/tables/${enc(t)}/rows`,
  rowsCancel: (id: string, t: string) => `/connections/${enc(id)}/tables/${enc(t)}/rows/cancel`,
  tableErd: (id: string, t: string) => `/connections/${enc(id)}/tables/${enc(t)}/erd`,
  erd: (id: string) => `/connections/${enc(id)}/erd`,
  mutationsPreview: (id: string, t: string) => `/connections/${enc(id)}/tables/${enc(t)}/mutations/preview`,
  mutations: (id: string, t: string) => `/connections/${enc(id)}/tables/${enc(t)}/mutations`,
  query: (id: string) => `/connections/${enc(id)}/query`,
} as const;
