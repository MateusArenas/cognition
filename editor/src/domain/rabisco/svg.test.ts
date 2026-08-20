import { describe, expect, it } from 'vitest';
import { blankRabisco } from '../mermaid/factory';
import type { RabiscoElement } from '../types';
import { defaultElementStyle } from './palette';
import { docToSvg } from './svg';

function forma(type: RabiscoElement['type'], x: number, y: number, w: number, h: number, extra: Partial<RabiscoElement> = {}): RabiscoElement {
  return {
    id: extra.id || 'f1', type, x, y, w, h,
    points: null, text: '', labelColor: '#000',
    startBinding: null, endBinding: null, groupId: null,
    seed: 1, version: 1,
    ...defaultElementStyle('#1B1B1F'),
    ...extra,
  };
}

describe('domain/rabisco/svg — docToSvg', () => {
  it('doc vazio ainda gera um <svg> válido', () => {
    const svg = docToSvg(blankRabisco());
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain('</svg>');
  });

  it('um retângulo preenchido vira <path> de fill mais <path> de stroke', () => {
    const rect = forma('rect', 10, 10, 100, 50, { bgColor: '#FF0000', fillStyle: 'solid' });
    const svg = docToSvg({ ...blankRabisco(), elements: [rect] });
    expect(svg).toContain('fill="#FF0000"');
    expect(svg).toContain(`stroke="${rect.strokeColor}"`);
  });

  it('texto usa text-anchor conforme o alinhamento', () => {
    const centered = forma('text', 0, 0, 80, 20, { type: 'text', text: 'oi', textAlign: 'center' });
    const svg = docToSvg({ ...blankRabisco(), elements: [centered] });
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('>oi<');
  });

  it('texto escapa caracteres especiais de XML', () => {
    const el = forma('text', 0, 0, 80, 20, { type: 'text', text: 'a < b & c' });
    const svg = docToSvg({ ...blankRabisco(), elements: [el] });
    expect(svg).toContain('a &lt; b &amp; c');
  });

  it('rótulo preso numa forma (LABELABLE) sai como <text> extra dentro do grupo', () => {
    const rect = forma('rect', 0, 0, 100, 60, { text: 'rótulo' });
    const svg = docToSvg({ ...blankRabisco(), elements: [rect] });
    expect(svg).toContain('>rótulo<');
    expect(svg).toContain(`fill="${rect.labelColor}"`);
  });

  it('elemento girado ganha transform="rotate(deg cx cy)"', () => {
    const rect = forma('rect', 0, 0, 100, 100, { rotation: Math.PI / 2 });
    const svg = docToSvg({ ...blankRabisco(), elements: [rect] });
    expect(svg).toContain('transform="rotate(90 50 50)"');
  });

  it('viewBox inclui a folga (PADDING) em volta do conteúdo', () => {
    const rect = forma('rect', 0, 0, 100, 100);
    const svg = docToSvg({ ...blankRabisco(), elements: [rect] });
    const m = svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThan(0);
    expect(Number(m![3])).toBeGreaterThan(100);
  });
});
