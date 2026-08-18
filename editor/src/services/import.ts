// Importar (§16). iOS não tem UTI para .mmd — filtra pela extensão depois de ler o nome, não
// pelo tipo MIME do picker. .md/.markdown viram documento; o resto passa por parseMermaid.
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { blankMd } from '@/domain/mermaid/factory';
import { parseMermaid } from '@/domain/mermaid/parse';
import type { Doc } from '@/domain/types';
import { saveDoc } from './storage';

export async function importarDocumento(): Promise<Doc | null> {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: '*/*' });
  if (res.canceled || !res.assets?.[0]) return null;
  const file = res.assets[0];
  const conteudo = await FileSystem.readAsStringAsync(file.uri);
  const nome = file.name.replace(/\.[^.]+$/, '');
  const doc = /\.(md|markdown)$/i.test(file.name) ? blankMd(nome, conteudo) : parseMermaid(conteudo, nome);
  await saveDoc(doc);
  return doc;
}
