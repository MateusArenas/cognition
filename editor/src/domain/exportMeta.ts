// Metadados de exportação — pura, sem tocar em expo-file-system/expo-sharing, pelo mesmo
// motivo de domain/searchText.ts: fica testável sem depender de nada nativo (§16).
import type { Doc } from './types';

export function exportExtension(doc: Doc): string {
  return doc.tipo === 'md' ? '.md' : doc.tipo === 'rabisco' ? '.svg' : '.mmd';
}

export function exportMime(doc: Doc): string {
  return doc.tipo === 'md' ? 'text/markdown' : doc.tipo === 'rabisco' ? 'image/svg+xml' : 'text/plain';
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
