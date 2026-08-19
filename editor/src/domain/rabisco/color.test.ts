import { describe, expect, it } from 'vitest';
import { hsvToRgb, parseColor, rgbaToCss, rgbaToHex, rgbToHsv } from './color';

describe('domain/rabisco/color', () => {
  it('hsvToRgb dos vértices do círculo (vermelho, verde, azul puros)', () => {
    expect(hsvToRgb({ h: 0, s: 1, v: 1 })).toEqual({ r: 255, g: 0, b: 0 });
    expect(hsvToRgb({ h: 120, s: 1, v: 1 })).toEqual({ r: 0, g: 255, b: 0 });
    expect(hsvToRgb({ h: 240, s: 1, v: 1 })).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('rgbToHsv é a inversa de hsvToRgb pros vértices', () => {
    const { r, g, b } = hsvToRgb({ h: 0, s: 1, v: 1 });
    const hsv = rgbToHsv(r, g, b);
    expect(hsv.h).toBeCloseTo(0, 1);
    expect(hsv.s).toBeCloseTo(1, 5);
    expect(hsv.v).toBeCloseTo(1, 5);
  });

  it('rgbToHsv de cinza (sem saturação) devolve s=0', () => {
    expect(rgbToHsv(128, 128, 128).s).toBe(0);
  });

  it('rgbaToHex sem alfa (opaco) devolve 6 dígitos', () => {
    expect(rgbaToHex({ r: 255, g: 59, b: 48, a: 1 })).toBe('#ff3b30');
  });

  it('rgbaToHex com alfa devolve 8 dígitos', () => {
    expect(rgbaToHex({ r: 255, g: 59, b: 48, a: 0.5 })).toBe('#ff3b3080');
  });

  it('rgbaToCss opaco usa rgb(), com alfa usa rgba()', () => {
    expect(rgbaToCss({ r: 255, g: 0, b: 0, a: 1 })).toBe('rgb(255, 0, 0)');
    expect(rgbaToCss({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('parseColor reconhece hex curto, longo, com alfa, e rgb()/rgba()', () => {
    expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('#ff000080')).toEqual({ r: 255, g: 0, b: 0, a: expect.closeTo(0.5, 1) });
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('rgba(255, 0, 0, 0.5)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
  });

  it('parseColor devolve null pra entrada que não reconhece', () => {
    expect(parseColor('não é uma cor')).toBeNull();
    expect(parseColor('')).toBeNull();
  });

  it('parseColor+rgbaToHex é ida-e-volta pra hex de 6 dígitos', () => {
    const parsed = parseColor('#0a84ff')!;
    expect(rgbaToHex(parsed)).toBe('#0a84ff');
  });
});
