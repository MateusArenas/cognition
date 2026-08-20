// Tokenizador do console SQL livre (Etapa DB2) — mesma técnica e mesmo formato de Token do
// realce de Mermaid (features/code/highlight.ts): uma regex só, grupos nomeados, longest-first,
// reaproveita o MESMO CodeEditor de sobreposição (texto colorido + TextInput transparente) em
// vez de duplicar a lógica de teclado/scroll. TokenType tem que bater com o de lá pra poder
// compartilhar o componente.
import type { Token, TokenType } from '../../code/highlight';

const PALAVRAS = [
  'select', 'from', 'where', 'join', 'left', 'right', 'inner', 'outer', 'full', 'cross', 'on',
  'group', 'by', 'order', 'having', 'limit', 'offset', 'as', 'and', 'or', 'not', 'null', 'is',
  'in', 'between', 'like', 'ilike', 'distinct', 'with', 'union', 'all', 'case', 'when', 'then',
  'else', 'end', 'asc', 'desc', 'exists', 'over', 'partition', 'coalesce', 'cast', 'count',
  'sum', 'avg', 'min', 'max', 'true', 'false',
];

const HL_RE = new RegExp(
  [
    '(?<com>--[^\\n]*)',
    '(?<str>\'(?:[^\'\\\\]|\\\\.)*\')',
    '(?<op>[<>]=|<>|!=|[=<>+\\-*/%])',
    '(?<kw>\\b(?:' + PALAVRAS.join('|') + ')\\b)',
    '(?<num>\\b\\d+(?:\\.\\d+)?\\b)',
    '(?<br>[\\[\\]{}()])',
    '(?<pun>[:,;.])',
  ].join('|'),
  'gi'
);

// Mesma garantia de highlight.ts#tokenize: a concatenação de todos os tokens reconstrói `code`
// byte a byte, senão as duas camadas do editor (fundo colorido + TextInput transparente) saem
// do alinhamento.
export function tokenizeSql(code: string): Token[] {
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

export const SQL_COLORS: Record<'dark' | 'light', Record<TokenType, string>> = {
  dark: { com: '#6E7681', str: '#7BD88F', card: '#64D2FF', op: '#64D2FF', kw: '#FF7AB2', num: '#FF9F0A', br: '#8E8E93', pun: '#9CA3AF', text: '#FFFFFF' },
  light: { com: '#8A8F98', str: '#1E7F35', card: '#0062CC', op: '#0062CC', kw: '#A036C4', num: '#B35A00', br: '#6E6E73', pun: '#6B7280', text: '#000000' },
};
