// Parser/serializer CSV — RFC 4180 à mão, porte quase literal de tabelas.html (protótipo de
// referência). Sem papaparse: ~30 linhas cobre aspas escapadas, evita 40 KB de bundle à toa.
import type { CsvDoc } from '../types';
import { evaluateSheet } from './formula';

type CsvDelimiter = CsvDoc['delimiter'];

// Conta ,/;/tab fora de aspas na primeira linha não vazia — exportação de ERP brasileiro quase
// sempre vem com ";". Empate ou nenhum separador encontrado cai pra vírgula (o mais comum).
export function detectDelim(text: string): CsvDelimiter {
  const line = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const counts: Record<string, number> = { ',': 0, ';': 0 };
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  return counts[';'] > counts[','] ? ';' : ',';
}

export function parseCSV(text: string, delim?: CsvDelimiter): string[][] {
  text = text.replace(/^﻿/, '');
  const d = delim || detectDelim(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === d) {
      row.push(cur);
      cur = '';
    } else if (ch === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else if (ch === '\r') {
      // ignora — CRLF vira LF puro
    } else cur += ch;
  }
  row.push(cur);
  rows.push(row);
  while (rows.length > 1 && rows[rows.length - 1].every((v) => v === '')) rows.pop();
  const width = Math.max(1, ...rows.map((r) => r.length));
  rows.forEach((r) => {
    while (r.length < width) r.push('');
  });
  return rows;
}

// Texto CSV pronto pra exportar: fórmulas saem CALCULADAS (CSV não tem fórmula) — nunca a
// string crua "=SOMA(...)". BOM (﻿) prefixado quando o separador é ";", pro Excel abrir
// com acentuação correta sem perguntar encoding (mesma armadilha de docs/19-tabelas-csv.md).
export function sheetToText(doc: CsvDoc, delim: CsvDelimiter): string {
  const evaluated = evaluateSheet(doc.cells);
  const rows = doc.cells.map((row, r) => row.map((_v, c) => evaluated.shown(r, c)));
  const text = toCSV(rows, delim);
  return delim === ';' ? '﻿' + text : text;
}

export function toCSV(rows: string[][], delim: CsvDelimiter): string {
  const needsQuote = new RegExp(`["\\n\\r${delim}]`);
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v == null ? '' : String(v);
          return needsQuote.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(delim)
    )
    .join('\n');
}
