// Exportar e compartilhar (§16). PNG é gerado no lado web (o canvas já tem o SVG e um
// <canvas>) — ver DiagramCanvas#exportPng; aqui só escreve o arquivo e entrega pro share sheet.
// Ver a nota em features/diagram/canvas/useRuntimeHtml.ts: o import default de
// 'expo-file-system' (SDK 54+) não tem implementação de verdade pras funções antigas.
import * as FileSystem from 'expo-file-system/legacy';
import { exportExtension, exportMime, slugFilename } from '@/domain/exportMeta';
import { serialize } from '@/domain/mermaid/serialize';
import type { Doc } from '@/domain/types';
import { shareFile } from './share';

export async function exportarTexto(doc: Doc): Promise<void> {
  const uri = FileSystem.cacheDirectory + slugFilename(doc.nome) + exportExtension(doc);
  const conteudo = doc.tipo === 'md' ? doc.md : serialize(doc);
  await FileSystem.writeAsStringAsync(uri, conteudo);
  await shareFile(uri, exportMime(doc));
}

// scale limitado a 3: um diagrama de 40 nós em 3x já dá ~2MB de base64 atravessando a ponte
// e trava a UI por meio segundo — não vale ir além (docs/12-persistencia-e-export.md).
export async function exportarPng(base64: string, nome: string): Promise<void> {
  const uri = FileSystem.cacheDirectory + slugFilename(nome) + '.png';
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' });
  await shareFile(uri, 'image/png');
}
