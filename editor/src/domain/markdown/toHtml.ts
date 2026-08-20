// Markdown -> HTML, pra exportação (PDF via expo-print — services/export.ts). Reaproveita a
// MESMA árvore de `renderMarkdown` que já alimenta o modo Ler em RN (MarkdownPreview.tsx) —
// geometria/estrutura uma vez, N saídas, mesmo espírito de domain/rabisco/svg.ts. Só HTML
// estático: um bloco ```mermaid``` embutido não é re-renderizado como diagrama aqui (isso
// pediria rodar o mermaid.js inteiro dentro do HTML do PDF, ver docs/12-persistencia-e-export.md)
// — sai como bloco de código rotulado, sempre correto mesmo sem motor nenhum disponível.
import type { Inline, MdItem, MdNode } from './render';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineHtml(filhos: Inline[]): string {
  return filhos
    .map((n) => {
      switch (n.t) {
        case 'text':
          return esc(n.texto);
        case 'bold':
          return `<strong>${inlineHtml(n.filhos)}</strong>`;
        case 'italic':
          return `<em>${inlineHtml(n.filhos)}</em>`;
        case 'strike':
          return `<s>${inlineHtml(n.filhos)}</s>`;
        case 'mark':
          return `<mark>${inlineHtml(n.filhos)}</mark>`;
        case 'code':
          return `<code>${esc(n.texto)}</code>`;
        case 'link':
          return `<a href="${esc(n.href)}">${inlineHtml(n.filhos)}</a>`;
        case 'image':
          return `<span class="imgref">[${esc(n.alt || 'imagem')}]</span>`;
        default:
          return '';
      }
    })
    .join('');
}

function itemHtml(item: MdItem): string {
  const texto = inlineHtml(item.filhos);
  const corpo = item.tarefa
    ? `<span class="task"><span class="box ${item.tarefa.feita ? 'done' : ''}"></span>${texto}</span>`
    : texto;
  const sub = item.sub ? item.sub.map(nodeHtml).join('') : '';
  return `<li>${corpo}${sub}</li>`;
}

function nodeHtml(node: MdNode): string {
  switch (node.t) {
    case 'heading':
      return `<h${node.nivel}>${inlineHtml(node.filhos)}</h${node.nivel}>`;
    case 'paragraph':
      return `<p>${inlineHtml(node.filhos)}</p>`;
    case 'hr':
      return '<hr />';
    case 'quote':
      return `<blockquote>${node.filhos.map(nodeHtml).join('')}</blockquote>`;
    case 'code':
      return `<pre><code>${esc(node.corpo)}</code></pre>`;
    case 'mermaid':
      return `<div class="mermaid-src"><div class="mermaid-label">Diagrama Mermaid</div><pre><code>${esc(node.corpo)}</code></pre></div>`;
    case 'list':
      return `<${node.ordenada ? 'ol' : 'ul'}>${node.itens.map(itemHtml).join('')}</${node.ordenada ? 'ol' : 'ul'}>`;
    case 'table': {
      const head = `<tr>${node.cabecalho.map((c, i) => `<th style="text-align:${node.alinhamento[i]}">${inlineHtml(c)}</th>`).join('')}</tr>`;
      const rows = node.linhas
        .map((linha) => `<tr>${linha.map((c, i) => `<td style="text-align:${node.alinhamento[i]}">${inlineHtml(c)}</td>`).join('')}</tr>`)
        .join('');
      return `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
    }
    default:
      return '';
  }
}

const CSS = `
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1b1b1f; padding: 32px; line-height: 1.5; }
  h1, h2, h3, h4 { font-weight: 700; margin: 22px 0 8px; }
  h1 { font-size: 27px; } h2 { font-size: 22px; } h3 { font-size: 19px; }
  h4 { font-size: 17px; font-weight: 600; color: #5a5a60; }
  p { margin: 0 0 14px; }
  hr { border: none; border-top: 1px solid #d0d0d5; margin: 18px 0; }
  blockquote { border-left: 3px solid #0a84ff; padding-left: 15px; margin: 0 0 14px; color: #3a3a3f; }
  pre { background: #f2f2f7; border-radius: 12px; padding: 14px; margin: 0 0 14px; overflow-x: auto; }
  code { font-family: Menlo, monospace; font-size: 13.5px; }
  p code, li code { background: #f2f2f7; border-radius: 4px; padding: 1px 4px; }
  mark { background: #ff950055; }
  ul, ol { margin: 0 0 14px; padding-left: 22px; }
  li { margin-bottom: 4px; }
  .task { display: inline-flex; align-items: center; gap: 8px; }
  .box { width: 15px; height: 15px; border-radius: 8px; border: 1.8px solid #a0a0a5; display: inline-block; }
  .box.done { background: #0a84ff; border-color: #0a84ff; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 14px; }
  th, td { border: 1px solid #d0d0d5; padding: 8px 10px; font-size: 14px; }
  th { background: #f2f2f7; }
  .imgref { color: #8a8a90; }
  .mermaid-src { border: 1px solid #d0d0d5; border-radius: 12px; padding: 12px 14px; margin: 0 0 14px; }
  .mermaid-label { font-size: 12px; font-weight: 600; color: #8a8a90; margin-bottom: 6px; text-transform: uppercase; }
  .mermaid-src pre { margin: 0; }
`;

export function mdToHtml(titulo: string, nodes: MdNode[]): string {
  const body = nodes.map(nodeHtml).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}
