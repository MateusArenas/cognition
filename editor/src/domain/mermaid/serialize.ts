// Modelo -> texto Mermaid. Nunca editado por regex durante a interação — ver a
// "regra de ouro" em docs/04-dominio.md (ESPECIFICACAO-APP-RN-EXPO.md §6.2).
import type { Doc, ErDoc, FlowDoc, FlowNode } from '../types';
import { LINKS } from './links';
import { SHAPES } from './shapes';

export function q(s: string | null | undefined): string {
  const v = s == null ? '' : String(s);
  return '"' + v.replace(/"/g, '#quot;').replace(/\n/g, '<br/>') + '"';
}

export function slug(s: string | null | undefined): string {
  return (String(s || '').trim().replace(/\s+/g, '_').replace(/[^\w-]/g, '')) || 'x';
}

export function serialize(d: Doc): string {
  switch (d.tipo) {
    case 'md':
      return d.md;
    case 'raw':
      return d.code;
    case 'er':
      return serializeER(d);
    case 'flow':
      return serializeFlow(d);
    case 'rabisco':
      // Sem representação em texto Mermaid — Rabisco não passa pelo canvas WebView (é
      // renderizado direto em Skia, ver docs/16-rabisco.md), então isso nunca alimenta um
      // `mermaid.render()` de verdade. Só existe pra função continuar total sobre `Doc`.
      return '%% rabisco — sem representação em texto Mermaid';
  }
}

function nodeByIdIn(d: FlowDoc, id: string): FlowNode | undefined {
  return d.nodes.find((n) => n.id === id);
}

export function serializeFlow(d: FlowDoc): string {
  const L: string[] = ['flowchart ' + (d.direction || 'TD')];
  const inGroup = new Set<string>();
  (d.groups || []).forEach((g) => g.nodes.forEach((n) => inGroup.add(n)));

  const decl = (n: FlowNode) => {
    const s = SHAPES[n.shape] || SHAPES.rect;
    return '    ' + n.id + s.open + q(n.label) + s.close;
  };

  // A ordem de emissão textual (não a ordem bruta de d.nodes) é o que decide a ordem dos
  // alvos em `class ...`. Precisa ser assim: depois de um round-trip serialize->parse, o
  // parser reconstrói d.nodes na ordem em que os nós aparecem no texto — se `class` usasse a
  // ordem bruta do array, a linha mudaria de ordem a cada volta sem nenhuma mudança real.
  const ungrouped = d.nodes.filter((n) => !inGroup.has(n.id));
  const emissionOrder: FlowNode[] = [...ungrouped];
  ungrouped.forEach((n) => L.push(decl(n)));

  (d.groups || []).forEach((g) => {
    L.push('    subgraph ' + g.id + '[' + q(g.label) + ']');
    if (g.direction) L.push('        direction ' + g.direction);
    g.nodes.forEach((id) => {
      const n = nodeByIdIn(d, id);
      if (n) {
        L.push('    ' + decl(n));
        emissionOrder.push(n);
      }
    });
    L.push('    end');
  });

  d.edges.forEach((e) => {
    const op = (LINKS[e.type] || LINKS.arrow).op;
    L.push('    ' + e.from + ' ' + op + (e.label ? '|' + q(e.label) + '|' : '') + ' ' + e.to);
  });

  (d.classes || []).forEach((c) => {
    const parts: string[] = [];
    if (c.fill) parts.push('fill:' + c.fill);
    if (c.stroke) parts.push('stroke:' + c.stroke);
    if (c.color) parts.push('color:' + c.color);
    parts.push('stroke-width:' + (c.width || 2) + 'px');
    L.push('    classDef ' + c.id + ' ' + parts.join(','));
    const alvos = emissionOrder.filter((n) => n.cls === c.id).map((n) => n.id);
    if (alvos.length) L.push('    class ' + alvos.join(',') + ' ' + c.id);
  });

  return L.join('\n');
}

export function serializeER(d: ErDoc): string {
  const L: string[] = ['erDiagram'];
  d.tables.forEach((t) => {
    if (!t.cols.length) {
      L.push('    ' + t.id + ' {}');
      return;
    }
    L.push('    ' + t.id + ' {');
    t.cols.forEach((c) => {
      let ln = '        ' + slug(c.type || 'string') + ' ' + slug(c.name || 'campo');
      if (c.keys && c.keys.length) ln += ' ' + c.keys.join(',');
      if (c.note) ln += ' ' + q(c.note).replace(/<br\/>/g, ' ');
      L.push(ln);
    });
    L.push('    }');
  });
  d.relations.forEach((r) => {
    L.push(
      '    ' + r.from + ' ' + r.cardL + (r.identifying === false ? '..' : '--') + r.cardR + ' ' + r.to +
        ' : ' + q(r.label || '').replace(/<br\/>/g, ' ')
    );
  });
  return L.join('\n');
}
