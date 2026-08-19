// Conversões de cor puras — sem UI, sem Skia — pro seletor de cor do Rabisco (picker HSV +
// campo hex/rgba). `r,g,b` em 0-255, `a` em 0-1, `h` em 0-360, `s`/`v` em 0-1.
export interface RGBA { r: number; g: number; b: number; a: number }
export interface HSV { h: number; s: number; v: number }

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function hsvToRgb({ h, s, v }: HSV): { r: number; g: number; b: number } {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function toHex2(n: number): string {
  return clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
}

export function rgbaToHex({ r, g, b, a }: RGBA): string {
  const base = `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
  return a >= 1 ? base : `${base}${toHex2(a * 255)}`;
}

export function rgbaToCss({ r, g, b, a }: RGBA): string {
  return a >= 1 ? `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})` : `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${+a.toFixed(2)})`;
}

// Aceita #rgb, #rrggbb, #rrggbbaa, rgb(...)/rgba(...) — o que uma pessoa colaria de qualquer
// lugar. `null` se não reconhecer, pra quem chama decidir se ignora ou mostra erro.
export function parseColor(input: string): RGBA | null {
  const s = input.trim();
  const hex = s.match(/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (rgb) {
    return { r: clamp(+rgb[1], 0, 255), g: clamp(+rgb[2], 0, 255), b: clamp(+rgb[3], 0, 255), a: rgb[4] !== undefined ? clamp(+rgb[4], 0, 1) : 1 };
  }
  return null;
}
