// Texto Mermaid -> modelo. Contraparte de serialize.ts — junte para reler §6.2/§6.4.
import type { Direction, ErDoc, FlowDoc, FlowGroup, FlowNode, LinkKey } from '../types';
import { uid } from '../id';
import { blankER, blankFlow, blankRaw } from './factory';
import { OP2LINK } from './links';
import { detectarTipo } from './catalog';
import type { Doc } from '../types';

export function unq(s: string | null | undefined): string {
  let v = String(s == null ? '' : s).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v.replace(/#quot;/g, '"').replace(/<br\s*\/?>/gi, '\n').trim();
}

const SHAPE_PATTERNS: [FlowNode['shape'], RegExp][] = [
  ['doublecirc', /^([A-Za-z0-9_-]+)\(\(\(([\s\S]*)\)\)\)$/],
  ['circle', /^([A-Za-z0-9_-]+)\(\(([\s\S]*)\)\)$/],
  ['subroutine', /^([A-Za-z0-9_-]+)\[\[([\s\S]*)\]\]$/],
  ['cylinder', /^([A-Za-z0-9_-]+)\[\(([\s\S]*)\)\]$/],
  ['stadium', /^([A-Za-z0-9_-]+)\(\[([\s\S]*)\]\)$/],
  ['hexagon', /^([A-Za-z0-9_-]+)\{\{([\s\S]*)\}\}$/],
  ['trapez', /^([A-Za-z0-9_-]+)\[\/([\s\S]*)\\\]$/],
  ['trapezR', /^([A-Za-z0-9_-]+)\[\\([\s\S]*)\/\]$/],
  ['parallel', /^([A-Za-z0-9_-]+)\[\/([\s\S]*)\/\]$/],
  ['parallelR', /^([A-Za-z0-9_-]+)\[\\([\s\S]*)\\\]$/],
  ['rect', /^([A-Za-z0-9_-]+)\[([\s\S]*)\]$/],
  ['round', /^([A-Za-z0-9_-]+)\(([\s\S]*)\)$/],
  ['rhombus', /^([A-Za-z0-9_-]+)\{([\s\S]*)\}$/],
];

const OP_RE = /\s*(<-->|-\.->|-\.-|<==>|==>|===|--x|--o|-->|---|--|==)\s*/;
const PLAIN = new Set(['--', '-.-', '===', '==', '---']);
const ARROW = new Set(['-->', '-.->', '==>', '--x', '--o', '<-->', '<==>']);

function normalizeOps(s: string): string {
  return s
    .replace(/-\.{1,}-+>/g, '-.->')
    .replace(/-\.{1,}-(?![>])/g, '-.-')
    .replace(/={3,}>/g, '==>')
    .replace(/-{3,}>/g, '-->')
    .replace(/-{4,}(?![>ox])/g, '---');
}

export function parseMermaid(text: string, nomeAtual = 'Diagrama'): Doc {
  const raw = String(text || '').split('\n');
  const lines: string[] = [];
  for (let l of raw) {
    l = l.replace(/%%[\s\S]*$/, '').trim();
    if (l) lines.push(l);
  }
  if (!lines.length) throw new Error('Código vazio.');
  if (/^erDiagram\b/i.test(lines[0])) return parseER(lines, nomeAtual);
  if (/^(flowchart|graph)\b/i.test(lines[0])) return parseFlow(lines, nomeAtual);
  // Não lança em tipo desconhecido: é o que faz "colar qualquer Mermaid" funcionar.
  return blankRaw(nomeAtual, detectarTipo(lines[0]), String(text));
}

export function parseFlow(lines: string[], nomeAtual = 'Importado'): FlowDoc {
  const d = blankFlow(nomeAtual);
  const m = /^(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)/i.exec(lines[0]);
  d.direction = (m ? m[1].toUpperCase() : 'TD') as Direction;
  const stack: FlowGroup[] = [];

  const ensure = (tok: string | null | undefined, shapeHint?: FlowNode['shape']): FlowNode | null => {
    tok = String(tok || '').trim();
    if (!tok) return null;
    let id = tok;
    let label: string | null = null;
    let shape: FlowNode['shape'] | null = null;
    for (const [k, re] of SHAPE_PATTERNS) {
      const mm = re.exec(tok);
      if (mm) {
        id = mm[1];
        label = unq(mm[2]);
        shape = k;
        break;
      }
    }
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
    let n = d.nodes.find((x) => x.id === id);
    if (!n) {
      n = { id, label: label != null ? label : id, shape: shape || shapeHint || 'rect', cls: null };
      d.nodes.push(n);
    } else if (shape) {
      n.label = label as string;
      n.shape = shape;
    }
    const g = stack[stack.length - 1];
    if (g && !g.nodes.includes(n.id)) g.nodes.push(n.id);
    return n;
  };

  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i];
    if (/^end\b/i.test(ln)) {
      stack.pop();
      continue;
    }
    let mm: RegExpExecArray | null;
    if ((mm = /^subgraph\s+([A-Za-z0-9_-]+)\s*\[([\s\S]*)\]$/i.exec(ln))) {
      const g: FlowGroup = { id: mm[1], label: unq(mm[2]), nodes: [], direction: null };
      d.groups.push(g);
      stack.push(g);
      continue;
    }
    if ((mm = /^subgraph\s+(.+)$/i.exec(ln))) {
      const nm = unq(mm[1]);
      const g: FlowGroup = { id: 'sg' + (d.groups.length + 1), label: nm, nodes: [], direction: null };
      d.groups.push(g);
      stack.push(g);
      continue;
    }
    if ((mm = /^direction\s+(TB|TD|BT|LR|RL)/i.exec(ln))) {
      const dir = mm[1].toUpperCase() as Direction;
      if (stack.length) stack[stack.length - 1].direction = dir;
      else d.direction = dir;
      continue;
    }
    if ((mm = /^classDef\s+([A-Za-z0-9_-]+)\s+(.+)$/i.exec(ln))) {
      const c = { id: mm[1], fill: null as string | null, stroke: null as string | null, color: null as string | null, width: 2 };
      mm[2].split(',').forEach((p) => {
        const [k, v] = p.split(':').map((s) => s && s.trim());
        if (k === 'fill') c.fill = v;
        if (k === 'stroke') c.stroke = v;
        if (k === 'color') c.color = v;
        if (k === 'stroke-width') c.width = parseFloat(v) || 2;
      });
      if (!d.classes.some((x) => x.id === c.id)) d.classes.push(c);
      continue;
    }
    if ((mm = /^class\s+([A-Za-z0-9_,\-\s]+)\s+([A-Za-z0-9_-]+)$/i.exec(ln))) {
      const cls = mm[2];
      mm[1]
        .split(',')
        .map((s) => s.trim())
        .forEach((id) => {
          const n = ensure(id);
          if (n) n.cls = cls;
        });
      continue;
    }
    if (/^(style|linkStyle|click|accTitle|accDescr)\b/i.test(ln)) continue;

    const parts = normalizeOps(ln)
      .split(OP_RE)
      .map((s) => (s == null ? '' : s.trim()));
    if (parts.length === 1) {
      ensure(parts[0]);
      continue;
    }
    let idx = 0;
    let prev = ensure(parts[0]);
    while (idx + 2 < parts.length) {
      let op = parts[idx + 1];
      let next = parts[idx + 2];
      let label: string | null = null;
      let step = 2;
      if (PLAIN.has(op) && parts[idx + 3] && ARROW.has(parts[idx + 3])) {
        label = unq(next);
        op = parts[idx + 3];
        next = parts[idx + 4] || '';
        step = 4;
      }
      const pm = /^\|([^|]*)\|\s*([\s\S]*)$/.exec(next);
      if (pm) {
        label = unq(pm[1]);
        next = pm[2].trim();
      }
      const to = ensure(next);
      if (prev && to) {
        d.edges.push({ id: uid('e'), from: prev.id, to: to.id, label: label || '', type: (OP2LINK[op] || 'arrow') as LinkKey });
      }
      prev = to;
      idx += step;
    }
  }

  d.groups = d.groups.filter((g) => g.nodes.length);
  return d;
}

export function parseER(lines: string[], nomeAtual = 'Importado'): ErDoc {
  const d = blankER(nomeAtual);
  const ensureT = (name: string) => {
    const id = name; // nomes de tabela já vêm como identificador Mermaid válido
    let t = d.tables.find((x) => x.id === id);
    if (!t) {
      t = { id, label: id, cols: [] };
      d.tables.push(t);
    }
    return t;
  };
  let cur: (typeof d.tables)[number] | null = null;

  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i];
    if (cur) {
      if (/^\}/.test(ln)) {
        cur = null;
        continue;
      }
      const toks = ln.match(/"[^"]*"|\S+/g) || [];
      if (toks.length < 2) continue;
      const col = { type: toks[0] || '', name: toks[1] || '', keys: [] as Array<'PK' | 'FK' | 'UK'>, note: '' };
      for (let k = 2; k < toks.length; k++) {
        const t = toks[k];
        if (/^"/.test(t)) col.note = unq(t);
        else
          t.split(',').forEach((x) => {
            const up = x.trim().toUpperCase();
            if (up === 'PK' || up === 'FK' || up === 'UK') col.keys.push(up);
          });
      }
      cur.cols.push(col);
      continue;
    }
    let mm: RegExpExecArray | null;
    if ((mm = /^([A-Za-z0-9_-]+)(?:\[[^\]]*\])?\s*\{\s*\}?$/.exec(ln))) {
      const t = ensureT(mm[1]);
      if (!/\}\s*$/.test(ln)) cur = t;
      continue;
    }
    if ((mm = /^(\S+)\s+(\S\S)(--|\.\.)(\S\S)\s+(\S+)\s*:\s*([\s\S]*)$/.exec(ln))) {
      const a = ensureT(mm[1]);
      const b = ensureT(mm[5]);
      d.relations.push({
        id: uid('r'),
        from: a.id,
        to: b.id,
        cardL: mm[2] as ErDoc['relations'][number]['cardL'],
        cardR: mm[4] as ErDoc['relations'][number]['cardR'],
        identifying: mm[3] === '--',
        label: unq(mm[6]),
      });
      continue;
    }
    if ((mm = /^([A-Za-z0-9_-]+)$/.exec(ln))) ensureT(mm[1]);
  }
  return d;
}
