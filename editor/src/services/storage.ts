// Persistência da biblioteca (§15). expo-sqlite com a API assíncrona — MMKV seria mais
// rápido mas exige development build, não roda no Expo Go, atrasaria o início.
import * as SQLite from 'expo-sqlite';
import type { Doc } from '@/domain/types';
import { extractSearchText, subtipoDe } from '@/domain/searchText';

export { extractSearchText, subtipoDe };

export interface DocRow {
  id: string;
  nome: string;
  tipo: string;
  subtipo: string | null;
  atualizado_em: number;
  fixado: number;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('editor.db').then(async (db) => {
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS documentos (
           id TEXT PRIMARY KEY, nome TEXT NOT NULL, tipo TEXT NOT NULL, subtipo TEXT,
           json TEXT NOT NULL, texto_busca TEXT, atualizado_em INTEGER NOT NULL, fixado INTEGER DEFAULT 0
         );
         CREATE INDEX IF NOT EXISTS idx_doc_data ON documentos(atualizado_em DESC);`
      );
      return db;
    });
  }
  return dbPromise;
}

export async function saveDoc(doc: Doc): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO documentos (id, nome, tipo, subtipo, json, texto_busca, atualizado_em, fixado)
     VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT fixado FROM documentos WHERE id = ?), 0))
     ON CONFLICT(id) DO UPDATE SET
       nome = excluded.nome, tipo = excluded.tipo, subtipo = excluded.subtipo,
       json = excluded.json, texto_busca = excluded.texto_busca, atualizado_em = excluded.atualizado_em`,
    doc.id,
    doc.nome,
    doc.tipo,
    subtipoDe(doc),
    JSON.stringify(doc),
    extractSearchText(doc),
    doc.atualizadoEm,
    doc.id
  );
}

export async function listDocs(query = ''): Promise<DocRow[]> {
  const db = await getDb();
  const cols = 'id, nome, tipo, subtipo, atualizado_em, fixado';
  if (query.trim()) {
    const like = `%${query.trim()}%`;
    return db.getAllAsync<DocRow>(
      `SELECT ${cols} FROM documentos WHERE nome LIKE ? OR texto_busca LIKE ? ORDER BY fixado DESC, atualizado_em DESC`,
      like,
      like
    );
  }
  return db.getAllAsync<DocRow>(`SELECT ${cols} FROM documentos ORDER BY fixado DESC, atualizado_em DESC`);
}

export async function loadDoc(id: string): Promise<Doc | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ json: string }>('SELECT json FROM documentos WHERE id = ?', id);
  return row ? (JSON.parse(row.json) as Doc) : null;
}

export async function deleteDoc(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM documentos WHERE id = ?', id);
}

export async function setPinned(id: string, fixado: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE documentos SET fixado = ? WHERE id = ?', fixado ? 1 : 0, id);
}
