// Exportar e compartilhar (§16). PNG de diagrama Mermaid é gerado no lado web (o canvas já tem
// o SVG e um <canvas>) — ver DiagramCanvas#exportPng; aqui só escreve o arquivo e entrega pro
// share sheet. PNG de Rabisco é gerado offline no Skia (sem WebView, ver docs/16-rabisco.md) —
// svgParaPngBase64() abaixo. PDF (Etapa R6.2) é o mesmo caminho pras duas telas: pega o SVG já
// pronto (do bridge do WebView ou de domain/rabisco/svg.ts) e imprime via expo-print, que
// funciona no Expo Go sem precisar de conta de loja nenhuma.
// Ver a nota em features/diagram/canvas/useRuntimeHtml.ts: o import default de
// 'expo-file-system' (SDK 54+) não tem implementação de verdade pras funções antigas.
import { ImageFormat, Skia } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { exportExtension, exportMime, slugFilename } from '@/domain/exportMeta';
import { mdToHtml } from '@/domain/markdown/toHtml';
import { renderMarkdown } from '@/domain/markdown/render';
import { serialize } from '@/domain/mermaid/serialize';
import { docToSvg } from '@/domain/rabisco/svg';
import type { Doc, MdDoc, RabiscoDoc } from '@/domain/types';
import { shareFile } from './share';

export async function exportarTexto(doc: Doc): Promise<void> {
  const uri = FileSystem.cacheDirectory + slugFilename(doc.nome) + exportExtension(doc);
  const conteudo = doc.tipo === 'md' ? doc.md : doc.tipo === 'rabisco' ? docToSvg(doc) : serialize(doc);
  await FileSystem.writeAsStringAsync(uri, conteudo);
  await shareFile(uri, exportMime(doc));
}

// Mesmo caminho de exportarTexto, mas pra um texto solto sem Doc por trás — o ERD do cliente
// de banco (DiagramCard) gera Mermaid a partir do catálogo, não de um documento salvo no app.
export async function exportarMermaidTexto(code: string, nome: string): Promise<void> {
  const uri = FileSystem.cacheDirectory + slugFilename(nome) + '.mmd';
  await FileSystem.writeAsStringAsync(uri, code);
  await shareFile(uri, 'text/plain');
}

// scale limitado a 3: um diagrama de 40 nós em 3x já dá ~2MB de base64 atravessando a ponte
// e trava a UI por meio segundo — não vale ir além (docs/12-persistencia-e-export.md).
export async function exportarPng(base64: string, nome: string): Promise<void> {
  const uri = FileSystem.cacheDirectory + slugFilename(nome) + '.png';
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' });
  await shareFile(uri, 'image/png');
}

function svgParaPngBase64(svg: string, width: number, height: number, scale = 2): string | null {
  const dom = Skia.SVG.MakeFromString(svg);
  if (!dom) return null;
  const surface = Skia.Surface.MakeOffscreen(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('transparent'));
  canvas.save();
  canvas.scale(scale, scale);
  canvas.drawSvg(dom, width, height);
  canvas.restore();
  surface.flush();
  return surface.makeImageSnapshot().encodeToBase64(ImageFormat.PNG);
}

// Sem WebView no Rabisco (é Skia nativo, docs/16-rabisco.md) — em vez de pedir pro canvas ao
// vivo tirar um snapshot (dependeria do zoom/pan atuais na tela), reaproveita o MESMO SVG do
// export de arquivo: gera de novo a partir do doc, então sai sempre enquadrado no conteúdo
// inteiro, do jeito que o usuário vê em "Exportar arquivo SVG".
export async function exportarRabiscoPng(doc: RabiscoDoc, scale = 2): Promise<void> {
  const svg = docToSvg(doc);
  const w = svg.match(/width="([\d.]+)"/);
  const h = svg.match(/height="([\d.]+)"/);
  const width = w ? parseFloat(w[1]) : 400;
  const height = h ? parseFloat(h[1]) : 400;
  const base64 = svgParaPngBase64(svg, width, height, scale);
  if (!base64) return;
  await exportarPng(base64, doc.nome);
}

async function printHtmlToPdfFile(html: string, nome: string, width?: number, height?: number): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html, width, height });
  const dest = FileSystem.cacheDirectory + slugFilename(nome) + '.pdf';
  await FileSystem.copyAsync({ from: uri, to: dest });
  await shareFile(dest, 'application/pdf');
}

// PDF de diagrama/desenho: mesma função pros dois (Mermaid via bridge do WebView, Rabisco via
// domain/rabisco/svg.ts) — ambos chegam aqui já como uma string SVG pronta, do tamanho exato
// do conteúdo (a página do PDF acompanha, em vez do Letter padrão de um documento de texto).
export async function exportarPdf(svg: string, nome: string): Promise<void> {
  const w = svg.match(/width="([\d.]+)"/);
  const h = svg.match(/height="([\d.]+)"/);
  const width = w ? Math.min(Math.max(Math.round(parseFloat(w[1])), 100), 3000) : 612;
  const height = h ? Math.min(Math.max(Math.round(parseFloat(h[1])), 100), 3000) : 792;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}svg{display:block;width:100%;height:auto}</style></head><body>${svg}</body></html>`;
  await printHtmlToPdfFile(html, nome, width, height);
}

// PDF de documento Markdown: sem largura/altura fixa — expo-print pagina sozinho no tamanho
// Letter padrão (612×792), como qualquer documento de texto. Reaproveita a MESMA árvore
// (`renderMarkdown`) que já alimenta o modo Ler em RN — domain/markdown/toHtml.ts espelha
// MarkdownPreview.tsx elemento por elemento, mesmo padrão de domain/rabisco/svg.ts. Bloco
// ```mermaid``` embutido sai como código-fonte rotulado, não como diagrama renderizado (ver
// nota no topo de toHtml.ts).
export async function exportarMdPdf(doc: MdDoc): Promise<void> {
  const html = mdToHtml(doc.nome, renderMarkdown(doc.md));
  await printHtmlToPdfFile(html, doc.nome);
}
