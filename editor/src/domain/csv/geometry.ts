// Geometria da grade — offsets de coluna, hit-test por coordenada. Porte de
// plano-editor-csv-expo.md §10.1. Altura de linha FIXA é decisão consciente: dá hit-test O(1)
// na vertical, estimatedItemSize exato pro FlashList, e overlay de seleção posicionado por
// multiplicação simples — altura variável (texto com quebra) viraria um problema de layout à
// parte, fora do MVP (ver "wrap" em mutations.ts: quando ligado, usa uma segunda altura FIXA,
// não altura livre).

export const ROW_H = 44;
export const ROW_H_WRAP = 88;
export const GUTTER_W = 44;
export const HEADER_H = 32;
export const DEFAULT_COL_W = 104;
export const MIN_COL_W = 48;
export const MAX_COL_W = 560;

// off[c] = x (em pt) onde a coluna c começa. off[widths.length] = largura total.
export function colOffsets(widths: number[]): number[] {
  const off = [0];
  for (let i = 0; i < widths.length; i++) off.push(off[i] + widths[i]);
  return off;
}

// Busca binária: qual coluna contém a posição x (relativa ao início da grade, sem o gutter).
export function colAt(x: number, offsets: number[]): number {
  const last = offsets.length - 2;
  if (last < 0) return 0;
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (offsets[m] <= x) lo = m;
    else hi = m - 1;
  }
  return Math.max(0, Math.min(last, lo));
}

export function rowAt(y: number, rowH: number = ROW_H): number {
  return Math.max(0, Math.floor(y / rowH));
}
