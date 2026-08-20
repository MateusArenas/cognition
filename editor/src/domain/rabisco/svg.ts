// Serializa um RabiscoDoc pra um documento SVG autocontido — mesma geometria de
// domain/rabisco/geom.ts que alimenta o Skia (Canvas.tsx#ElementView), só emitida como markup
// em vez de <Path>/<Group> do react-native-skia. Único lugar que sabe desenhar um
// RabiscoElement fora do canvas nativo: alimenta o export .svg, a cópia pro clipboard, o
// rasterizar-pra-PNG (services/export.ts) e o embutir-num-PDF (expo-print) — geometria uma vez,
// N saídas, mesmo espírito do runtime WebView dos diagramas Mermaid (docs/06-canvas.md).
import type { RabiscoDoc, RabiscoElement } from '../types';
import { LABELABLE, ROTATABLE, bounds, boundsOfSelection, dashPattern, elementGeometry } from './geom';
import { FONT_FAMILIES } from './palette';

const FONT_FAMILY_MAP: Record<string, string> = Object.fromEntries(FONT_FAMILIES.map((f) => [f.key, f.family]));
const PADDING = 24;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Mesmo pivô/ângulo de `rotateTransform` (Canvas.tsx) — só reescrito como atributo SVG
// (`rotate(deg cx cy)`, graus) em vez de matriz do Skia (radianos).
function rotateAttr(el: RabiscoElement, all: RabiscoElement[]): string {
  if (!el.rotation || !ROTATABLE.has(el.type)) return '';
  const g = bounds(el, all);
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
  const deg = (el.rotation * 180) / Math.PI;
  return ` transform="rotate(${deg} ${cx} ${cy})"`;
}

function textAnchorX(el: RabiscoElement): { anchor: string; x: number } {
  if (el.textAlign === 'center') return { anchor: 'middle', x: el.x + el.w / 2 };
  if (el.textAlign === 'right') return { anchor: 'end', x: el.x + el.w };
  return { anchor: 'start', x: el.x };
}

function elementSvg(el: RabiscoElement, all: RabiscoElement[]): string {
  const rotate = rotateAttr(el, all);

  if (el.type === 'text') {
    const lh = el.fontSize * 1.25;
    const { anchor, x } = textAnchorX(el);
    const family = FONT_FAMILY_MAP[el.fontFamily] || 'Helvetica Neue';
    const lines = el.text
      .split('\n')
      .map(
        (line, i) =>
          `<text x="${x}" y="${el.y + i * lh + el.fontSize}" font-family="${esc(family)}" font-size="${el.fontSize}" fill="${el.strokeColor}" text-anchor="${anchor}">${esc(line)}</text>`
      )
      .join('');
    return `<g opacity="${el.opacity}"${rotate}>${lines}</g>`;
  }

  const geo = elementGeometry(el, all);
  const parts: string[] = [];
  if (geo.fillKind === 'solid') parts.push(`<path d="${geo.clip}" fill="${el.bgColor}" />`);
  if (geo.fillKind === 'hatch') {
    parts.push(
      `<path d="${geo.hatch}" fill="none" stroke="${el.bgColor}" stroke-width="${Math.max(1.4, el.strokeWidth * 0.62)}" stroke-linecap="round" />`
    );
  }
  if (geo.stroke) {
    const dash = el.strokeStyle !== 'solid' ? ` stroke-dasharray="${dashPattern(el).join(' ')}"` : '';
    parts.push(
      `<path d="${geo.stroke}" fill="none" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dash} />`
    );
  }
  if (geo.arrowHeads) {
    parts.push(
      `<path d="${geo.arrowHeads}" fill="none" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`
    );
  }
  if (LABELABLE.has(el.type) && el.text) {
    const g = bounds(el, all);
    const lines = el.text.split('\n');
    const lh = el.fontSize * 1.25;
    const top = g.y + g.h / 2 - (lines.length * lh) / 2;
    const family = FONT_FAMILY_MAP[el.fontFamily] || 'Helvetica Neue';
    lines.forEach((line, i) => {
      parts.push(
        `<text x="${g.x + g.w / 2}" y="${top + i * lh + el.fontSize}" font-family="${esc(family)}" font-size="${el.fontSize}" fill="${el.labelColor}" text-anchor="middle">${esc(line)}</text>`
      );
    });
  }
  return `<g opacity="${el.opacity}"${rotate}>${parts.join('')}</g>`;
}

// Sem fundo (transparente) — o mesmo SVG alimenta tanto o export .svg (onde fundo opaco seria
// errado) quanto o PNG/PDF (onde services/export.ts decide o fundo na hora de rasterizar).
export function docToSvg(doc: RabiscoDoc): string {
  const box = boundsOfSelection(doc.elements, doc.elements);
  const x = (box ? box.x : 0) - PADDING;
  const y = (box ? box.y : 0) - PADDING;
  const w = (box ? box.w : 200) + PADDING * 2;
  const h = (box ? box.h : 200) + PADDING * 2;
  const body = doc.elements.map((el) => elementSvg(el, doc.elements)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${Math.round(w)}" height="${Math.round(h)}">${body}</svg>`;
}
