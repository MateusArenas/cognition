// Paleta e estilo padrão de um elemento novo — porte dos valores de `STROKES`/`FILLS`/`S.style`
// do protótipo (whiteboard-ios.html:578-596). `INK` não é fixo como lá (o protótipo detecta
// dark mode com `matchMedia` direto no domínio); aqui quem decide a cor de tinta padrão é a UI,
// via useTheme() — domain/ não pode depender de aparência (regra de ouro, docs/04-dominio.md).
import type { RabiscoElement, RabiscoElementType, RabiscoFontFamily } from '../types';

export const STROKES = ['#FF3B30', '#34C759', '#007AFF', '#FF9500', '#AF52DE'];
export const FILLS = ['transparent', '#FFD8D6', '#C9F0D4', '#CFE6FF', '#FFEBC2', '#EBD9FF'];

// Tamanhos de fonte com nome — mesmos valores dos presets P/M/G/GG do protótipo
// (whiteboard-ios.html:1910), só renomeados pra S/M/L/XL.
export const FONT_SIZES: { key: 'S' | 'M' | 'L' | 'XL'; value: number }[] = [
  { key: 'S', value: 16 },
  { key: 'M', value: 22 },
  { key: 'L', value: 32 },
  { key: 'XL', value: 48 },
];

// `family` é o nome que o FontMgr do Skia precisa reconhecer de verdade (CTFontManager no
// iOS) — "System" não é um nome de família válido aí, só um alias que o RN puro entende, então
// nunca usar isso como fontFamily de matchFont() (bug real: texto renderizava em branco, sem
// erro nenhum, porque matchFamilyStyle não achava nada pra "System").
export const FONT_FAMILIES: { key: RabiscoFontFamily; label: string; family: string }[] = [
  { key: 'sans', label: 'Sans', family: 'Helvetica Neue' },
  { key: 'serif', label: 'Serif', family: 'Georgia' },
  { key: 'mono', label: 'Mono', family: 'Menlo' },
];

export function defaultElementStyle(strokeColor: string): Pick<
  RabiscoElement,
  'strokeColor' | 'bgColor' | 'fillStyle' | 'strokeWidth' | 'strokeStyle' | 'roughness' | 'opacity' | 'fontSize' | 'edges' | 'arrowType' | 'fontFamily' | 'textAlign' | 'rotation'
> {
  return {
    strokeColor,
    bgColor: 'transparent',
    fillStyle: 'hachure',
    strokeWidth: 2.6,
    strokeStyle: 'solid',
    roughness: 1.4,
    opacity: 1,
    fontSize: 22,
    rotation: 0,
    edges: 'round',
    arrowType: 'straight',
    fontFamily: 'sans',
    textAlign: 'left',
  };
}

// Elemento novo em branco, no ponto onde o dedo tocou — porte de `newEl()`
// (whiteboard-ios.html:632-636). Formas/texto nascem com w=h=0 (crescem no arrasto); traço e
// lineares (linha/seta) nascem com `points` já inicializados, mesmo padrão do protótipo.
export function newElement(type: RabiscoElementType, x: number, y: number, strokeColor: string): Omit<RabiscoElement, 'id'> {
  const base = {
    type, x, y, w: 0, h: 0,
    points: null as [number, number][] | null,
    text: '', labelColor: strokeColor,
    startBinding: null, endBinding: null, groupId: null,
    seed: Math.floor(Math.random() * 2 ** 31), version: 1,
    ...defaultElementStyle(strokeColor),
  };
  if (type === 'draw') return { ...base, points: [[0, 0]] };
  if (type === 'line' || type === 'arrow') return { ...base, points: [[0, 0], [0, 0]] };
  return base;
}
