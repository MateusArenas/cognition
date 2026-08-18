// Metadados de exportação — pura, sem tocar em expo-file-system/expo-sharing, pelo mesmo
// motivo de domain/searchText.ts: fica testável sem depender de nada nativo (§16).
import type { Doc } from './types';

export function exportExtension(doc: Doc): string {
  return doc.tipo === 'md' ? '.md' : '.mmd';
}

export function exportMime(doc: Doc): string {
  return doc.tipo === 'md' ? 'text/markdown' : 'text/plain';
}

export function slugFilename(nome: string): string {
  return (
    nome
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '') || 'documento'
  );
}
