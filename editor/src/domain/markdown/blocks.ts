// Localizar, substituir e inserir blocos Mermaid dentro do markdown — base da integração
// documento↔diagrama (§13.4). Tudo depende dos offsets do render.ts baterem com
// md.slice(ini,fim) === corpo.
import { renderMarkdown, type MdNode } from './render';

export interface MermaidBlockRef {
  corpo: string;
  ini: number;
  fim: number;
}

export function findMermaidBlocks(md: string): MermaidBlockRef[] {
  const out: MermaidBlockRef[] = [];
  const walk = (nodes: MdNode[]) => {
    for (const n of nodes) {
      if (n.t === 'mermaid') out.push({ corpo: n.corpo, ini: n.ini, fim: n.fim });
      else if (n.t === 'quote') walk(n.filhos);
      else if (n.t === 'list') for (const item of n.itens) if (item.sub) walk(item.sub);
    }
  };
  walk(renderMarkdown(md));
  return out;
}

export function replaceBlock(md: string, bloco: MermaidBlockRef, novoCorpo: string): string {
  return md.slice(0, bloco.ini) + novoCorpo + md.slice(bloco.fim);
}

export function insertMermaidBlock(md: string, at: number, corpo: string): string {
  const antes = md.slice(0, at);
  const precisaQuebra = antes.length > 0 && !antes.endsWith('\n\n');
  const prefixo = precisaQuebra ? (antes.endsWith('\n') ? '\n' : '\n\n') : '';
  const depois = md.slice(at);
  const sufixo = depois.startsWith('\n') ? '' : '\n';
  return antes + prefixo + '```mermaid\n' + corpo + '\n```\n' + sufixo + depois;
}

export function countWords(md: string): number {
  return (md.match(/\S+/g) || []).length;
}

export function countDiagrams(md: string): number {
  return findMermaidBlocks(md).length;
}
