// Tokenizador do editor de código (docs/09-editor-de-codigo.md, ESPECIFICACAO-APP-RN-EXPO.md
// §12). Sete classes, numa única regex com grupos nomeados, longest-first. Porta exata da
// lista de palavras-chave e da regex do protótipo (editor-mermaid.html).
export type TokenType = 'com' | 'str' | 'card' | 'op' | 'kw' | 'num' | 'br' | 'pun' | 'text';

export interface Token {
  type: TokenType;
  text: string;
}

const PALAVRAS = [
  'flowchart', 'graph', 'erDiagram', 'sequenceDiagram', 'classDiagram', 'stateDiagram-v2',
  'stateDiagram', 'journey', 'gantt', 'pie', 'mindmap', 'timeline', 'gitGraph', 'quadrantChart',
  'requirementDiagram', 'C4Context', 'C4Container', 'C4Component', 'kanban', 'block-beta', 'packet-beta',
  'sankey-beta', 'xychart-beta', 'radar-beta', 'treemap-beta', 'venn-beta', 'ishikawa-beta',
  'architecture-beta', 'treeView-beta', 'zenuml', 'subgraph', 'end', 'direction', 'classDef', 'class',
  'style', 'linkStyle', 'click', 'participant', 'actor', 'Note', 'note', 'loop', 'alt', 'else', 'opt', 'par',
  'critical', 'rect', 'activate', 'deactivate', 'autonumber', 'section', 'title', 'state', 'commit', 'branch',
  'checkout', 'merge', 'cherry-pick', 'tag', 'axis', 'curve', 'max', 'min', 'set', 'union', 'service', 'group',
  'requirement', 'functionalRequirement', 'element', 'dateFormat', 'axisFormat', 'excludes', 'todayMarker',
  'x-axis', 'y-axis', 'bar', 'line', 'showData', 'accTitle', 'accDescr', 'Person', 'System', 'System_Ext', 'Rel',
  'done', 'active', 'crit', 'milestone', 'satisfies', 'derives', 'verifies', 'contains', 'traces', 'refines',
];

const HL_RE = new RegExp(
  [
    '(?<com>%%[^\\n]*)',
    '(?<str>"(?:[^"\\\\]|\\\\.)*")',
    '(?<card>[|}o][|o{](?:--|\\.\\.)[|o{][|o{]?)',
    '(?<op><?[-=.]{2,}[>xo]?)',
    '(?<kw>\\b(?:' + PALAVRAS.map((w) => w.replace(/-/g, '\\-')).join('|') + ')\\b)',
    '(?<num>\\b\\d+(?:\\.\\d+)?\\b)',
    '(?<br>[\\[\\]{}()])',
    '(?<pun>[:,;|@#])',
  ].join('|'),
  'g'
);

// O texto de todos os tokens concatenado tem que reconstruir `code` byte a byte — é o que
// impede o alinhamento das duas camadas do editor (fundo colorido + TextInput transparente)
// de quebrar silenciosamente (§12, docs/13-qualidade-e-testes.md).
export function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let ultimo = 0;
  HL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HL_RE.exec(code)) !== null) {
    if (m[0] === '') {
      HL_RE.lastIndex++;
      continue;
    }
    if (m.index > ultimo) tokens.push({ type: 'text', text: code.slice(ultimo, m.index) });
    const g = m.groups || {};
    const tipo = (Object.keys(g) as TokenType[]).find((k) => g[k] != null) || 'pun';
    tokens.push({ type: tipo, text: m[0] });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < code.length) tokens.push({ type: 'text', text: code.slice(ultimo) });
  return tokens;
}
