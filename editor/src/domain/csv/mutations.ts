// Mutações puras do CSV: recebem e devolvem CsvDoc, nunca mutam o original — mesmo estilo de
// mutations/flow.ts (structuredClone, devolve o próprio doc de entrada quando é no-op).
import type { CsvDoc } from '../types';
import { numval, shiftFormula } from './formula';
import { DEFAULT_COL_W } from './geometry';

export function setCell(doc: CsvDoc, r: number, c: number, value: string): CsvDoc {
  if (!doc.cells[r] || doc.cells[r][c] === undefined) return doc;
  if (doc.cells[r][c] === value) return doc;
  const d = structuredClone(doc);
  d.cells[r][c] = value;
  return d;
}

export function insertRow(doc: CsvDoc, at: number): CsvDoc {
  const d = structuredClone(doc);
  const cols = d.cells[0]?.length ?? 0;
  d.cells.splice(at, 0, Array(cols).fill(''));
  return d;
}

export function insertCol(doc: CsvDoc, at: number): CsvDoc {
  const d = structuredClone(doc);
  d.colWidths.splice(at, 0, DEFAULT_COL_W);
  d.cells.forEach((row) => row.splice(at, 0, ''));
  return d;
}

export function deleteRows(doc: CsvDoc, a: number, b: number): CsvDoc {
  const count = b - a + 1;
  if (doc.cells.length - count < 1) return doc; // mantém ao menos 1 linha
  const d = structuredClone(doc);
  d.cells.splice(a, count);
  return d;
}

export function deleteCols(doc: CsvDoc, a: number, b: number): CsvDoc {
  const count = b - a + 1;
  if ((doc.cells[0]?.length ?? 0) - count < 1) return doc; // mantém ao menos 1 coluna
  const d = structuredClone(doc);
  d.colWidths.splice(a, count);
  d.cells.forEach((row) => row.splice(a, count));
  return d;
}

export function clearRange(doc: CsvDoc, r1: number, c1: number, r2: number, c2: number): CsvDoc {
  const d = structuredClone(doc);
  for (let i = r1; i <= r2; i++) for (let j = c1; j <= c2; j++) if (d.cells[i]) d.cells[i][j] = '';
  return d;
}

// "Preencher para baixo": a linha r1 de cada coluna do intervalo vira a origem, replicada pras
// linhas abaixo — fórmula tem a referência deslocada (shiftFormula), valor literal repete igual.
export function fillDown(doc: CsvDoc, r1: number, c1: number, r2: number, c2: number): CsvDoc {
  if (r1 === r2) return doc;
  const d = structuredClone(doc);
  for (let j = c1; j <= c2; j++) {
    const src = d.cells[r1][j];
    for (let i = r1 + 1; i <= r2; i++) d.cells[i][j] = shiftFormula(src, i - r1);
  }
  return d;
}

export function sortBy(doc: CsvDoc, col: number, dir: 1 | -1): CsvDoc {
  const d = structuredClone(doc);
  const start = d.headerRow ? 1 : 0;
  const head = d.cells.slice(0, start);
  const body = d.cells.slice(start);
  body.sort((x, y) => {
    const a = numval(x[col]);
    const b = numval(y[col]);
    const r = a != null && b != null ? a - b : String(x[col] || '').localeCompare(String(y[col] || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
    return dir * r;
  });
  d.cells = head.concat(body);
  return d;
}

export function setColWidth(doc: CsvDoc, col: number, width: number): CsvDoc {
  const d = structuredClone(doc);
  d.colWidths[col] = width;
  return d;
}

export function toggleWrap(doc: CsvDoc): CsvDoc {
  return { ...doc, wrap: !doc.wrap };
}

export function toggleHeaderRow(doc: CsvDoc): CsvDoc {
  return { ...doc, headerRow: !doc.headerRow };
}

export function setDelimiter(doc: CsvDoc, delimiter: CsvDoc['delimiter']): CsvDoc {
  return { ...doc, delimiter };
}

// Cola um bloco retangular a partir de (r1,c1) — cresce a tabela (linhas e/ou colunas) se o
// bloco colado não couber, mesmo comportamento do protótipo (colar sempre expande, nunca corta).
export function pasteRange(doc: CsvDoc, r1: number, c1: number, block: string[][]): CsvDoc {
  if (!block.length) return doc;
  const d = structuredClone(doc);
  const neededRows = r1 + block.length;
  const neededCols = c1 + Math.max(...block.map((row) => row.length));
  while (d.cells.length < neededRows) d.cells.push(Array(d.cells[0]?.length ?? neededCols).fill(''));
  if (neededCols > d.cells[0].length) {
    const grow = neededCols - d.cells[0].length;
    d.cells.forEach((row) => row.push(...Array(grow).fill('')));
    d.colWidths.push(...Array(grow).fill(DEFAULT_COL_W));
  }
  block.forEach((row, i) => {
    row.forEach((v, j) => {
      d.cells[r1 + i][c1 + j] = v;
    });
  });
  return d;
}
