// Importar (§16). iOS não tem UTI para .mmd — filtra pela extensão depois de ler o nome, não
// pelo tipo MIME do picker. .md/.markdown viram documento; o resto passa por parseMermaid.
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { blankMd, csvDocFromText } from '@/domain/mermaid/factory';
import { parseMermaid } from '@/domain/mermaid/parse';
import type { Doc } from '@/domain/types';
import { saveDoc } from './storage';

export async function importarDocumento(): Promise<Doc | null> {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: '*/*' });
  if (res.canceled || !res.assets?.[0]) return null;
  const file = res.assets[0];
  const conteudo = await FileSystem.readAsStringAsync(file.uri);
  const nome = file.name.replace(/\.[^.]+$/, '');
  // .txt fica de fora de propósito: pode ser Mermaid raw solto (o fallback de sempre) — só
  // .csv, sem ambiguidade, entra automaticamente como tabela aqui. O ImportSheet dedicado da
  // própria feature Tabelas (features/csv/ImportSheet.tsx) aceita .txt explicitamente, onde o
  // contexto (usuário already dentro do editor de CSV) não deixa dúvida nenhuma.
  const doc = /\.(md|markdown)$/i.test(file.name)
    ? blankMd(nome, conteudo)
    : /\.csv$/i.test(file.name)
      ? csvDocFromText(conteudo, nome, true)
      : parseMermaid(conteudo, nome);
  await saveDoc(doc);
  return doc;
}
