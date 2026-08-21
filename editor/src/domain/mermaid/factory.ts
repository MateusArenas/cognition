import { detectDelim, parseCSV } from '../csv/csv';
import type { CsvDoc, ErDoc, FlowDoc, MdDoc, RabiscoDoc, RawDoc } from '../types';
import { newDocId } from '../id';

function base() {
  const now = Date.now();
  return { id: newDocId(), criadoEm: now, atualizadoEm: now };
}

export function blankFlow(nome?: string): FlowDoc {
  return {
    ...base(),
    tipo: 'flow',
    nome: nome || 'Novo fluxograma',
    direction: 'TD',
    nodes: [],
    edges: [],
    groups: [],
    classes: [],
  };
}

export function blankER(nome?: string): ErDoc {
  return {
    ...base(),
    tipo: 'er',
    nome: nome || 'Novo modelo relacional',
    tables: [],
    relations: [],
  };
}

export function blankRaw(nome: string, kind: string, code: string): RawDoc {
  return {
    ...base(),
    tipo: 'raw',
    nome: nome || 'Diagrama',
    kind: kind || 'Código Mermaid',
    code: code || '',
  };
}

export function blankMd(nome: string, md: string): MdDoc {
  return {
    ...base(),
    tipo: 'md',
    nome: nome || 'Novo documento',
    md: md || '',
  };
}

export function blankRabisco(nome?: string): RabiscoDoc {
  return {
    ...base(),
    tipo: 'rabisco',
    nome: nome || 'Novo rabisco',
    elements: [],
  };
}

const CSV_ROWS = 30;
const CSV_COLS = 8;
const CSV_DEFAULT_COL_W = 104;

export function blankCsv(nome?: string): CsvDoc {
  return {
    ...base(),
    tipo: 'csv',
    nome: nome || 'Nova tabela',
    cells: Array.from({ length: CSV_ROWS }, () => Array(CSV_COLS).fill('')),
    headerRow: true,
    wrap: false,
    colWidths: Array(CSV_COLS).fill(CSV_DEFAULT_COL_W),
    delimiter: ',',
  };
}

// Constrói uma tabela a partir de texto CSV já lido (arquivo importado ou colado) — separador
// detectado sozinho (detectDelim), a menos que seja passado explicitamente. O encoding
// (UTF-8 vs. ISO-8859-1) é responsabilidade de quem lê o arquivo, não daqui — domínio é puro,
// não sabe nada de expo-file-system (ver services/import.ts).
export function csvDocFromText(text: string, nome: string, headerRow: boolean, delimiter?: CsvDoc['delimiter']): CsvDoc {
  const delim = delimiter || detectDelim(text);
  const cells = parseCSV(text, delim);
  return {
    ...base(),
    tipo: 'csv',
    nome: nome || 'Nova tabela',
    cells,
    headerRow,
    wrap: false,
    colWidths: Array(cells[0].length).fill(CSV_DEFAULT_COL_W),
    delimiter: delim,
  };
}
