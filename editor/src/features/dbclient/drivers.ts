// Catálogo de dialetos + campos de configuração — cada campo declara o caminho exato dentro do
// knexfile que o backend vai montar (DB-MOBILE.md §2.8). Campo novo é uma linha nova, nunca um
// `if` na tela (ConnectionFormScreen lê isto e desenha). Cobertura desta etapa: os quatro
// dialetos com driver de fato instalado no backend (pg/mysql2/better-sqlite3/tedious) — oracle
// fica de fora da lista do app até o driver `oracledb` (pesado, opcional) ser instalado lá
// (ver backend/src/catalog/dialects/oracle.strategy.ts).
export type FieldType = 'text' | 'number' | 'password' | 'switch';
export type FieldSection = 'connection' | 'ssl' | 'advanced';

export interface DriverField {
  path: string;
  labelKey: string;
  type: FieldType;
  section: FieldSection;
  required?: boolean;
  placeholder?: string;
}

export interface DriverDef {
  client: string;
  labelKey: string;
  fields: DriverField[];
}

const hostPortUserPass = (hostPath = 'connection.host'): DriverField[] => [
  { path: hostPath, labelKey: 'dbclient.fieldHost', type: 'text', section: 'connection', required: true, placeholder: 'localhost' },
  { path: 'connection.port', labelKey: 'dbclient.fieldPort', type: 'number', section: 'connection' },
  { path: 'connection.user', labelKey: 'dbclient.fieldUser', type: 'text', section: 'connection', required: true },
  { path: 'connection.password', labelKey: 'dbclient.fieldPassword', type: 'password', section: 'connection' },
  { path: 'connection.database', labelKey: 'dbclient.fieldDatabase', type: 'text', section: 'connection', required: true },
];

export const DRIVERS: DriverDef[] = [
  {
    client: 'pg',
    labelKey: 'dbclient.driverPg',
    fields: [
      ...hostPortUserPass(),
      { path: 'connection.ssl.enabled', labelKey: 'dbclient.fieldUseSsl', type: 'switch', section: 'ssl' },
      { path: 'connection.ssl.rejectUnauthorized', labelKey: 'dbclient.fieldValidateCert', type: 'switch', section: 'ssl' },
      { path: 'searchPath', labelKey: 'dbclient.fieldSearchPath', type: 'text', section: 'advanced', placeholder: 'public' },
    ],
  },
  {
    client: 'mysql2',
    labelKey: 'dbclient.driverMysql',
    fields: [...hostPortUserPass(), { path: 'connection.ssl.enabled', labelKey: 'dbclient.fieldUseSsl', type: 'switch', section: 'ssl' }],
  },
  {
    client: 'tedious',
    labelKey: 'dbclient.driverMssql',
    fields: [
      ...hostPortUserPass('connection.server'),
      { path: 'connection.options.encrypt', labelKey: 'dbclient.fieldUseSsl', type: 'switch', section: 'ssl' },
      { path: 'connection.options.trustServerCertificate', labelKey: 'dbclient.fieldValidateCert', type: 'switch', section: 'ssl' },
    ],
  },
  {
    client: 'better-sqlite3',
    labelKey: 'dbclient.driverSqlite',
    fields: [{ path: 'connection.filename', labelKey: 'dbclient.fieldFilename', type: 'text', section: 'connection', required: true, placeholder: '/caminho/para/banco.db' }],
  },
];

export function driverByClient(client: string): DriverDef | undefined {
  return DRIVERS.find((d) => d.client === client);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof cur[key] !== 'object' || cur[key] === null) cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

export { setPath, getPath };

// sqlite exige useNullAsDefault (DB-MOBILE.md §2.8) — o app garante isso sozinho, não é campo
// visível pro usuário.
export function baseConfigFor(client: string): Record<string, unknown> {
  return client.includes('sqlite') ? { connection: {}, useNullAsDefault: true } : { connection: {} };
}
