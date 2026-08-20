import { describe, expect, it } from 'vitest';
import { baseConfigFor, DRIVERS, driverByClient, getPath, setPath } from './drivers';

describe('dbclient/drivers — setPath/getPath', () => {
  it('cria os objetos intermediários que ainda não existem', () => {
    const obj: Record<string, unknown> = {};
    setPath(obj, 'connection.ssl.rejectUnauthorized', true);
    expect(obj).toEqual({ connection: { ssl: { rejectUnauthorized: true } } });
  });

  it('getPath lê o mesmo caminho de volta', () => {
    const obj = { connection: { host: 'localhost', ssl: { enabled: true } } };
    expect(getPath(obj, 'connection.host')).toBe('localhost');
    expect(getPath(obj, 'connection.ssl.enabled')).toBe(true);
  });

  it('getPath de um caminho que não existe volta undefined, sem lançar', () => {
    expect(getPath({}, 'connection.host')).toBeUndefined();
    expect(getPath({ connection: null }, 'connection.host')).toBeUndefined();
  });

  it('setPath não apaga irmãos já existentes no mesmo nível', () => {
    const obj: Record<string, unknown> = { connection: { host: 'localhost', port: 5432 } };
    setPath(obj, 'connection.user', 'app');
    expect(obj).toEqual({ connection: { host: 'localhost', port: 5432, user: 'app' } });
  });
});

describe('dbclient/drivers — catálogo', () => {
  it('todo dialeto listado tem pelo menos um campo obrigatório', () => {
    for (const d of DRIVERS) {
      expect(d.fields.some((f) => f.required)).toBe(true);
    }
  });

  it('driverByClient encontra pelo nome do client do knex', () => {
    expect(driverByClient('pg')?.client).toBe('pg');
    expect(driverByClient('nao-existe')).toBeUndefined();
  });

  it('baseConfigFor liga useNullAsDefault só para sqlite (exigência do knex)', () => {
    expect(baseConfigFor('better-sqlite3')).toEqual({ connection: {}, useNullAsDefault: true });
    expect(baseConfigFor('pg')).toEqual({ connection: {} });
  });
});
