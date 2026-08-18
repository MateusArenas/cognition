// Renderizador de Markdown escrito do zero (§13.3): funciona offline, controla a extração
// dos blocos Mermaid com offset em caracteres, e escapa HTML por padrão — a saída é uma
// árvore de nós (MdNode), não HTML, porque RN não tem dangerouslySetInnerHTML.
//
// As duas armadilhas de regex do spec: nada de lookbehind (mata o app no Safari < 16.4) — por
// isso o parser inline é um scanner manual, sem regex de lookbehind em lugar nenhum — e
// proteger os code spans primeiro, senão `**` dentro de crase vira negrito.
//
// Limitação conhecida: offsets de bloco mermaid e de título (`ini`, usado pela aba Estrutura,
// docs/10-markdown.md) só são exatos no nível raiz e dentro de listas — dentro de uma citação
// (`>`), o conteúdo é re-parseado como markdown independente (offsets relativos à citação, não
// ao documento). Título/mermaid dentro de citação é raro o suficiente pra aceitar isso por ora.

export type Inline =
  | { t: 'text'; texto: string }
  | { t: 'bold'; filhos: Inline[] }
  | { t: 'italic'; filhos: Inline[] }
  | { t: 'strike'; filhos: Inline[] }
  | { t: 'mark'; filhos: Inline[] }
  | { t: 'code'; texto: string }
  | { t: 'link'; href: string; filhos: Inline[] }
  | { t: 'image'; src: string; alt: string };

export interface MdItem {
  filhos: Inline[];
  tarefa?: { feita: boolean; ini: number; fim: number }; // offsets do "[ ]"/"[x]" na fonte
  sub?: MdNode[];
}

export type MdNode =
  | { t: 'heading'; nivel: 1 | 2 | 3 | 4; filhos: Inline[]; ini: number }
  | { t: 'paragraph'; filhos: Inline[] }
  | { t: 'list'; ordenada: boolean; itens: MdItem[] }
  | { t: 'quote'; filhos: MdNode[] }
  | { t: 'code'; lang: string; corpo: string }
  | { t: 'mermaid'; corpo: string; ini: number; fim: number }
  | { t: 'table'; cabecalho: Inline[][]; linhas: Inline[][][]; alinhamento: ('left' | 'center' | 'right')[] }
  | { t: 'hr' };

function lineOffsets(lines: string[]): number[] {
  const offsets: number[] = [];
  let p = 0;
  for (const l of lines) {
    offsets.push(p);
    p += l.length + 1;
  }
  return offsets;
}

function isBlockStart(line: string): boolean {
  return (
    /^(#{1,4})\s+/.test(line) ||
    /^```/.test(line) ||
    /^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim()) ||
    /^>\s?/.test(line) ||
    /^\s*([-*]|\d+\.)\s+/.test(line) ||
    /^\|/.test(line)
  );
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function cellAlign(cell: string): 'left' | 'center' | 'right' {
  const l = cell.startsWith(':'), r = cell.endsWith(':');
  if (l && r) return 'center';
  if (r) return 'right';
  return 'left';
}

export function renderMarkdown(md: string): MdNode[] {
  const lines = md.split('\n');
  const offsets = lineOffsets(lines);
  const nodes: MdNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }

    const fence = /^```\s*([\w-]*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] || '';
      const bodyStart = i + 1;
      let j = bodyStart;
      while (j < lines.length && !/^```\s*$/.test(lines[j])) j++;
      const corpo = lines.slice(bodyStart, j).join('\n');
      const ini = offsets[bodyStart] ?? md.length;
      const fim = ini + corpo.length;
      nodes.push(lang === 'mermaid' ? { t: 'mermaid', corpo, ini, fim } : { t: 'code', lang, corpo });
      i = j + 1;
      continue;
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      nodes.push({ t: 'heading', nivel: h[1].length as 1 | 2 | 3 | 4, filhos: parseInline(h[2]), ini: offsets[i] });
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      nodes.push({ t: 'hr' });
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && (/^>\s?/.test(lines[i]) || (quoteLines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])))) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      nodes.push({ t: 'quote', filhos: renderMarkdown(quoteLines.join('\n')) });
      continue;
    }

    if (/^\|/.test(line) && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1].trim()) && lines[i + 1].includes('-')) {
      const cabecalho = splitRow(line).map(parseInline);
      const alinhamento = splitRow(lines[i + 1]).map(cellAlign);
      let j = i + 2;
      const linhas: Inline[][][] = [];
      while (j < lines.length && /^\|/.test(lines[j])) {
        linhas.push(splitRow(lines[j]).map(parseInline));
        j++;
      }
      nodes.push({ t: 'table', cabecalho, linhas, alinhamento });
      i = j;
      continue;
    }

    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const { node, next } = parseList(lines, offsets, i, indentOf(line));
      nodes.push(node);
      i = next;
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && (paraLines.length === 0 || !isBlockStart(lines[i]))) {
      paraLines.push(lines[i]);
      i++;
    }
    nodes.push({ t: 'paragraph', filhos: parseInline(paraLines.join(' ')) });
  }

  return nodes;
}

function indentOf(line: string): number {
  return /^\s*/.exec(line)![0].length;
}

function parseList(lines: string[], offsets: number[], start: number, indent: number): { node: MdNode; next: number } {
  const marker = /^\s*([-*]|\d+\.)\s+/.exec(lines[start])!;
  const ordenada = /\d+\./.test(marker[1]);
  const itens: MdItem[] = [];
  let i = start;

  while (i < lines.length) {
    const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
    if (!m || m[1].length !== indent) break;
    const conteudoIni = offsets[i] + m[0].length - m[3].length;
    let texto = m[3];
    let tarefa: MdItem['tarefa'];
    const tk = /^\[( |x|X)\]\s*/.exec(texto);
    if (tk) {
      tarefa = { feita: tk[1].toLowerCase() === 'x', ini: conteudoIni + 1, fim: conteudoIni + 2 };
      texto = texto.slice(tk[0].length);
    }
    i++;

    // linhas mais indentadas viram uma sublista aninhada
    let sub: MdNode[] | undefined;
    if (i < lines.length) {
      const proxIndent = /^\s*/.exec(lines[i])?.[0].length ?? 0;
      if (lines[i].trim() !== '' && proxIndent > indent && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const r = parseList(lines, offsets, i, proxIndent);
        sub = [r.node];
        i = r.next;
      }
    }

    itens.push({ filhos: parseInline(texto), tarefa, sub });
  }

  return { node: { t: 'list', ordenada, itens }, next: i };
}

// --- inline ---------------------------------------------------------------

export function parseInline(text: string): Inline[] {
  const codeSpans: string[] = [];
  const protegido = text.replace(/`([^`]+)`/g, (_, c: string) => {
    codeSpans.push(c);
    return '\u0000' + (codeSpans.length - 1) + '\u0000';
  });
  return parseTokens(protegido, codeSpans);
}

function parseTokens(protegido: string, codeSpans: string[]): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  let buf = '';
  const flush = () => {
    if (buf) {
      out.push({ t: 'text', texto: buf });
      buf = '';
    }
  };

  while (i < protegido.length) {
    const resto = protegido.slice(i);

    const sentinel = /^\u0000(\d+)\u0000/.exec(resto);
    if (sentinel) {
      flush();
      out.push({ t: 'code', texto: codeSpans[Number(sentinel[1])] });
      i += sentinel[0].length;
      continue;
    }

    const img = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(resto);
    if (img) {
      flush();
      out.push({ t: 'image', alt: img[1], src: img[2] });
      i += img[0].length;
      continue;
    }

    const link = /^\[([^\]]*)\]\(([^)]+)\)/.exec(resto);
    if (link) {
      flush();
      out.push({ t: 'link', href: link[2], filhos: parseTokens(link[1], codeSpans) });
      i += link[0].length;
      continue;
    }

    const bold = /^(\*\*|__)([\s\S]+?)\1/.exec(resto);
    if (bold) {
      flush();
      out.push({ t: 'bold', filhos: parseTokens(bold[2], codeSpans) });
      i += bold[0].length;
      continue;
    }

    const strike = /^~~([\s\S]+?)~~/.exec(resto);
    if (strike) {
      flush();
      out.push({ t: 'strike', filhos: parseTokens(strike[1], codeSpans) });
      i += strike[0].length;
      continue;
    }

    const mark = /^==([\s\S]+?)==/.exec(resto);
    if (mark) {
      flush();
      out.push({ t: 'mark', filhos: parseTokens(mark[1], codeSpans) });
      i += mark[0].length;
      continue;
    }

    const ital = /^(\*|_)([^\s][\s\S]*?)\1/.exec(resto);
    if (ital) {
      flush();
      out.push({ t: 'italic', filhos: parseTokens(ital[2], codeSpans) });
      i += ital[0].length;
      continue;
    }

    buf += protegido[i];
    i++;
  }
  flush();
  return out;
}
