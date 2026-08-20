// Geometria do Rabisco: um `RabiscoElement` vira path SVG (`d`), fonte única consumida tanto
// pelo Skia (<Path path={d}>, que aceita string SVG direto) quanto pela exportação .svg (R7) —
// mesmo padrão "geometria uma vez, N renderizadores" do protótipo de referência
// (whiteboard-ios.html). Porte quase 1:1 das funções de lá; nomes em português onde o
// protótipo já não tinha nome em inglês específico.
import type { RabiscoArrowType, RabiscoElement, RabiscoBinding } from '../types';

const BINDABLE = new Set(['rect', 'diamond', 'ellipse', 'text']);
const LINEAR = new Set(['line', 'arrow']);
const LABELABLE = new Set(['rect', 'ellipse', 'diamond']);
const GAP = 6; // folga entre a ponta da seta e a borda da forma

function nn(v: number): string {
  return Number.isFinite(v) ? Math.round(v * 100) / 100 + '' : '0';
}

// Path builder — emite comandos SVG (M/L/Q/C/Z) como string. Porte direto de `PB()`
// (whiteboard-ios.html:693-703).
export function pathBuilder() {
  let d = '';
  return {
    m(x: number, y: number) { d += `M${nn(x)} ${nn(y)}`; },
    l(x: number, y: number) { d += `L${nn(x)} ${nn(y)}`; },
    q(cx: number, cy: number, x: number, y: number) { d += `Q${nn(cx)} ${nn(cy)} ${nn(x)} ${nn(y)}`; },
    c(a: number, b: number, c2: number, d2: number, x: number, y: number) { d += `C${nn(a)} ${nn(b)} ${nn(c2)} ${nn(d2)} ${nn(x)} ${nn(y)}`; },
    z() { d += 'Z'; },
    get d() { return d; },
  };
}
type PathBuilder = ReturnType<typeof pathBuilder>;

// Suaviza uma polilinha desenhando uma quadrática pelos pontos médios de cada par de pontos
// consecutivos. Porte de `smooth()` (whiteboard-ios.html:705-713).
export function smooth(p: PathBuilder, pts: [number, number][]) {
  if (pts.length < 2) return;
  p.m(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    p.q(pts[i][0], pts[i][1], mx, my);
  }
  const n = pts[pts.length - 1];
  p.l(n[0], n[1]);
}

const KAPPA = 0.5522847498307936;

// Elipse exata como 4 cúbicas. Porte de `ellipseD()` (whiteboard-ios.html:744-753).
export function ellipseD(cx: number, cy: number, rx: number, ry: number): string {
  const ox = rx * KAPPA, oy = ry * KAPPA, p = pathBuilder();
  p.m(cx - rx, cy);
  p.c(cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry);
  p.c(cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy);
  p.c(cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry);
  p.c(cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy);
  p.z();
  return p.d;
}

// Gerador pseudo-aleatório determinístico, semeado por elemento (`el.seed`) — a "rugosidade"
// (jitter à mão livre) fica estável entre re-renders/exportações. Porte de `mulberry32()`
// (whiteboard-ios.html:623-630).
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bounding box em coordenadas de cena. Porte de `bounds()` (whiteboard-ios.html:647-656) —
// `points` (traço/linear) usa min/max dos pontos resolvidos; formas usam x/y/w/h normalizados
// (w/h negativos só existem em rascunho, ver `normalizeElement`).
export function bounds(el: RabiscoElement, all: RabiscoElement[] = []): { x: number; y: number; w: number; h: number } {
  if (el.points) {
    const abs = LINEAR.has(el.type) ? resolvedPoints(el, all) : el.points.map((q) => [el.x + q[0], el.y + q[1]]);
    if (!abs || !abs.length) return { x: el.x, y: el.y, w: 1, h: 1 };
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const p of abs) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); }
    return { x: a, y: b, w: Math.max(c - a, 1), h: Math.max(d - b, 1) };
  }
  const x = el.w < 0 ? el.x + el.w : el.x, y = el.h < 0 ? el.y + el.h : el.y;
  return { x, y, w: Math.abs(el.w) || 1, h: Math.abs(el.h) || 1 };
}

// Rotação (extensão sem equivalente no protótipo) — só se aplica a formas com caixa própria
// (rect/diamond/ellipse/texto); linha/seta/traço continuam sem rotação nesta etapa (mudariam
// de forma nenhuma "natural" ao rotacionar — são sequência de pontos, não uma caixa — e teriam
// que herdar a rotação na âncora de ligação também, um escopo bem maior). `toElementLocal`
// desfaz a rotação de um ponto em coordenada de CENA em volta do centro da forma — é o que
// permite testar toque/alça com a MESMA matemática de sempre (sem rotação, eixo-alinhada): gira
// o ponto de toque pro referencial local da forma antes de comparar, em vez de girar a forma
// inteira pra comparar com o toque.
const ROTATABLE = new Set(['rect', 'diamond', 'ellipse', 'text']);

export function toElementLocal(el: RabiscoElement, p: { x: number; y: number }, all: RabiscoElement[]): { x: number; y: number } {
  if (!el.rotation || !ROTATABLE.has(el.type)) return p;
  const g = bounds(el, all);
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
  const cos = Math.cos(-el.rotation), sin = Math.sin(-el.rotation);
  const dx = p.x - cx, dy = p.y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

// Gira um ponto em volta de um pivô qualquer, em radianos — a operação inversa de
// `toElementLocal` (que desfaz uma rotação); esta APLICA uma.
export function rotatePoint(p: { x: number; y: number }, center: { x: number; y: number }, angle: number): { x: number; y: number } {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const dx = p.x - center.x, dy = p.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

// Gira um elemento INTEIRO (posição e orientação) em volta de um pivô EXTERNO — usado pra
// rotacionar um grupo de elementos selecionados como um corpo rígido só, "seguindo a
// orientação do quadrado de seleção" (pedido do usuário, Etapa R5). Diferente da rotação de UM
// elemento (`el.rotation`, gira em volta do PRÓPRIO centro): aqui a posição também órbita ao
// redor do centro do GRUPO. Forma com caixa própria (`ROTATABLE`) órbita o centro e soma no
// próprio campo `rotation`; linha/seta/traço (sem uso de `rotation` no render, ver
// `rotateTransform` em Canvas.tsx) giram cada ponto absoluto direto — o resultado visual é o
// mesmo tipo de giro, só armazenado de um jeito diferente por tipo de elemento.
export function rotateElementAround(el: RabiscoElement, center: { x: number; y: number }, delta: number): RabiscoElement {
  if (!delta) return el;
  if (el.points) {
    const abs = el.points.map(([px, py]) => rotatePoint({ x: el.x + px, y: el.y + py }, center, delta));
    const origin = abs[0];
    return { ...el, x: origin.x, y: origin.y, points: abs.map((q) => [q.x - origin.x, q.y - origin.y]) };
  }
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
  const nc = rotatePoint({ x: cx, y: cy }, center, delta);
  return { ...el, x: nc.x - el.w / 2, y: nc.y - el.h / 2, rotation: (el.rotation || 0) + delta };
}

// w/h negativos só existem durante o arrasto de criação — normaliza ao soltar o dedo. Porte
// de `normalize()` (whiteboard-ios.html:640-645).
export function normalizeElement(el: RabiscoElement): RabiscoElement {
  if (el.points) return el;
  const n = { ...el };
  if (n.w < 0) { n.x += n.w; n.w = -n.w; }
  if (n.h < 0) { n.y += n.h; n.h = -n.h; }
  return n;
}

export function boundsOfSelection(els: RabiscoElement[], all: RabiscoElement[]): { x: number; y: number; w: number; h: number } | null {
  if (!els.length) return null;
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const e of els) { const g = bounds(e, all); a = Math.min(a, g.x); b = Math.min(b, g.y); c = Math.max(c, g.x + g.w); d = Math.max(d, g.y + g.h); }
  return { x: a, y: b, w: c - a, h: d - b };
}

// ---- cantos arredondados --------------------------------------------------
export function cornerRadius(el: RabiscoElement, all: RabiscoElement[] = []): number {
  if (el.edges !== 'round' || (el.type !== 'rect' && el.type !== 'diamond')) return 0;
  const g = bounds(el, all);
  return Math.min(Math.min(g.w, g.h) * 0.25, 32);
}

interface Corner { in: [number, number]; c: [number, number]; out: [number, number] }

// Pra cada vértice: ponto de entrada, o vértice em si (controle) e ponto de saída. Porte de
// `corners()` (whiteboard-ios.html:929-942).
function corners(pts: [number, number][], r: number): Corner[] {
  const n = pts.length, out: Corner[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], pv = pts[(i - 1 + n) % n], nx = pts[(i + 1) % n];
    const d1 = Math.hypot(p[0] - pv[0], p[1] - pv[1]) || 1, d2 = Math.hypot(nx[0] - p[0], nx[1] - p[1]) || 1;
    const r1 = Math.min(r, d1 / 2), r2 = Math.min(r, d2 / 2);
    out.push({
      in: [p[0] + (pv[0] - p[0]) * r1 / d1, p[1] + (pv[1] - p[1]) * r1 / d1],
      c: p,
      out: [p[0] + (nx[0] - p[0]) * r2 / d2, p[1] + (nx[1] - p[1]) * r2 / d2],
    });
  }
  return out;
}

// ---- rugosidade "à mão livre" --------------------------------------------
// Porte de roughSeg/roughPoly/roughEllipse/roughRoundPoly/roughCurve (whiteboard-ios.html:714-
// 740, 944-987). `rough=0` desenha limpo (1 passada); `rough>0` desenha 2 passadas com jitter.
function roughSeg(p: PathBuilder, x1: number, y1: number, x2: number, y2: number, r: number, rnd: () => number) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const amp = Math.min(r * (0.6 + Math.min(len, 300) / 300 * 0.9), 12);
  const j = () => (rnd() - 0.5) * amp * 2;
  p.m(x1 + j() * 0.5, y1 + j() * 0.5);
  p.c(x1 + (x2 - x1) * 0.3 + j(), y1 + (y2 - y1) * 0.3 + j(), x1 + (x2 - x1) * 0.7 + j(), y1 + (y2 - y1) * 0.7 + j(), x2 + j() * 0.5, y2 + j() * 0.5);
}
function roughPoly(p: PathBuilder, pts: [number, number][], r: number, rnd: () => number) {
  if (r === 0) { smooth(p, pts); return; }
  for (let k = 0; k < 2; k++) for (let i = 0; i < pts.length - 1; i++) roughSeg(p, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r, rnd);
}
function roughEllipse(p: PathBuilder, cx: number, cy: number, rx: number, ry: number, r: number, rnd: () => number) {
  const n = Math.max(10, Math.min(40, Math.round((rx + ry) / 7))), passes = r === 0 ? 1 : 2;
  for (let k = 0; k < passes; k++) {
    const pts: [number, number][] = [];
    const a0 = r === 0 ? 0 : rnd() * Math.PI * 2;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rx + (r ? (rnd() - 0.5) * r * 2 : 0), cy + Math.sin(a) * ry + (r ? (rnd() - 0.5) * r * 2 : 0)]);
    }
    pts.push(pts[1]);
    smooth(p, pts);
  }
}
function roughRoundPoly(p: PathBuilder, pts: [number, number][], r: number, rough: number, rnd: () => number) {
  const cs = corners(pts, r), passes = rough === 0 ? 1 : 2;
  const j = () => (rough ? (rnd() - 0.5) * rough * 1.6 : 0);
  const bow = (x1: number, y1: number, x2: number, y2: number) => p.c(x1 + (x2 - x1) * 0.33 + j(), y1 + (y2 - y1) * 0.33 + j(), x1 + (x2 - x1) * 0.67 + j(), y1 + (y2 - y1) * 0.67 + j(), x2, y2);
  for (let k = 0; k < passes; k++) {
    let cur: [number, number] = [cs[0].out[0] + j(), cs[0].out[1] + j()];
    p.m(cur[0], cur[1]);
    for (let i = 0; i < cs.length; i++) {
      const nx = cs[(i + 1) % cs.length];
      const ip: [number, number] = [nx.in[0] + j(), nx.in[1] + j()];
      bow(cur[0], cur[1], ip[0], ip[1]);
      const op: [number, number] = [nx.out[0] + j(), nx.out[1] + j()];
      p.q(nx.c[0], nx.c[1], op[0], op[1]);
      cur = op;
    }
  }
}
function roughCurve(p: PathBuilder, pts: [number, number][], rough: number, rnd: () => number) {
  const passes = rough === 0 ? 1 : 2;
  for (let k = 0; k < passes; k++) {
    const j = () => (rough ? (rnd() - 0.5) * rough * 1.5 : 0);
    smooth(p, pts.map((q) => [q[0] + j(), q[1] + j()] as [number, number]));
  }
}

// ---- contorno (fill/hachura) ---------------------------------------------
function polyOf(el: RabiscoElement, all: RabiscoElement[]): [number, number][] | null {
  const g = bounds(el, all);
  if (el.type === 'rect') return [[g.x, g.y], [g.x + g.w, g.y], [g.x + g.w, g.y + g.h], [g.x, g.y + g.h]];
  if (el.type === 'diamond') return [[g.x + g.w / 2, g.y], [g.x + g.w, g.y + g.h / 2], [g.x + g.w / 2, g.y + g.h], [g.x, g.y + g.h / 2]];
  return null;
}
function solidD(el: RabiscoElement, all: RabiscoElement[]): string {
  const g = bounds(el, all);
  if (el.type === 'ellipse') return ellipseD(g.x + g.w / 2, g.y + g.h / 2, g.w / 2, g.h / 2);
  const pts = polyOf(el, all);
  if (!pts) return '';
  const r = cornerRadius(el, all), p = pathBuilder();
  if (r <= 0.5) {
    p.m(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.l(pts[i][0], pts[i][1]);
    p.z();
    return p.d;
  }
  const cs = corners(pts, r);
  p.m(cs[0].out[0], cs[0].out[1]);
  for (let i = 0; i < cs.length; i++) {
    const nx = cs[(i + 1) % cs.length];
    p.l(nx.in[0], nx.in[1]);
    p.q(nx.c[0], nx.c[1], nx.out[0], nx.out[1]);
  }
  p.z();
  return p.d;
}
function hachureD(el: RabiscoElement, all: RabiscoElement[]): string {
  const g = bounds(el, all), rnd = mulberry32(el.seed ^ 0x5f), p = pathBuilder();
  const gap = 9, span = g.w + g.h;
  for (const dir of el.fillStyle === 'cross' ? [1, -1] : [1]) {
    for (let i = -span; i < span; i += gap) roughSeg(p, g.x + i, g.y - 4, g.x + i + dir * (g.h + 8), g.y + g.h + 4, 1.2, rnd);
  }
  return p.d;
}
export function dashPattern(el: RabiscoElement): number[] {
  const u = Math.max(el.strokeWidth, 1.6);
  if (el.strokeStyle === 'dashed') return [u * 4, u * 3.2];
  if (el.strokeStyle === 'dotted') return [0.1, u * 2.6];
  return [];
}

// ---- ligação (arrow binding) ----------------------------------------------
// Porte de insideShape/pickBindable/boundaryPoint/bindingAt/bindPoint/resolvedPoints
// (whiteboard-ios.html:798-920). Só formas fecháveis (rect/diamond/ellipse) — `text` fica de
// fora por simplicidade nesta etapa (o protótipo inclui, mas rótulo livre bindável é raro).
export function insideShape(el: RabiscoElement, p: { x: number; y: number }, all: RabiscoElement[], tol = 0): boolean {
  const g = bounds(el, all);
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
  if (el.type === 'ellipse') return ((p.x - cx) / (g.w / 2 + tol)) ** 2 + ((p.y - cy) / (g.h / 2 + tol)) ** 2 <= 1;
  if (el.type === 'diamond') return Math.abs(p.x - cx) / (g.w / 2 + tol) + Math.abs(p.y - cy) / (g.h / 2 + tol) <= 1;
  return p.x >= g.x - tol && p.x <= g.x + g.w + tol && p.y >= g.y - tol && p.y <= g.y + g.h + tol;
}

// Histerese: prender exige 10px, soltar exige sair de 22px (porte de movePoint(),
// whiteboard-ios.html:1573-1594 — "sem isso a âncora pisca no limiar e o desprender vira
// acidente"). `currentId` é o alvo já ligado, se houver; sem ele (ex.: criando uma seta nova do
// zero) o comportamento é o de sempre, só o raio de 10px.
export function pickBindable(p: { x: number; y: number }, all: RabiscoElement[], excludeId: string | null, zoom: number, currentId?: string | null): RabiscoElement | null {
  const tol = 10 / zoom;
  for (let i = all.length - 1; i >= 0; i--) {
    const el = all[i];
    if (el.id === excludeId || !BINDABLE.has(el.type)) continue;
    if (insideShape(el, p, all, tol)) return el;
  }
  if (currentId) {
    const cur = all.find((e) => e.id === currentId && e.id !== excludeId && BINDABLE.has(e.type));
    if (cur && insideShape(cur, p, all, 22 / zoom)) return cur;
  }
  return null;
}

function projSeg(p: { x: number; y: number }, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  let t = L ? ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / L : 0;
  t = Math.min(1, Math.max(0, t));
  return { x: a[0] + dx * t, y: a[1] + dy * t };
}
function boundaryPoint(shape: RabiscoElement, p: { x: number; y: number }, all: RabiscoElement[]): { x: number; y: number } {
  const g = bounds(shape, all), cx = g.x + g.w / 2, cy = g.y + g.h / 2;
  if (shape.type === 'ellipse') {
    let dx = p.x - cx, dy = p.y - cy;
    if (!dx && !dy) dy = -1;
    const k = 1 / Math.hypot(dx / (g.w / 2 || 1), dy / (g.h / 2 || 1));
    return { x: cx + dx * k, y: cy + dy * k };
  }
  const poly: [number, number][] = shape.type === 'diamond'
    ? [[cx, g.y], [g.x + g.w, cy], [cx, g.y + g.h], [g.x, cy]]
    : [[g.x, g.y], [g.x + g.w, g.y], [g.x + g.w, g.y + g.h], [g.x, g.y + g.h]];
  let best = poly[0], bd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const q = projSeg(p, poly[i], poly[(i + 1) % poly.length]);
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < bd) { bd = d; best = [q.x, q.y]; }
  }
  return { x: best[0], y: best[1] };
}
export function bindingAt(shape: RabiscoElement, p: { x: number; y: number }, all: RabiscoElement[]): RabiscoBinding {
  const g = bounds(shape, all), a = boundaryPoint(shape, p, all);
  return { id: shape.id, fx: (a.x - (g.x + g.w / 2)) / (g.w / 2 || 1), fy: (a.y - (g.y + g.h / 2)) / (g.h / 2 || 1) };
}
// SEMPRE dinâmico — recalcula onde a linha cruza a borda da forma em direção a `from` toda vez,
// nunca tenta preservar um ponto fixo escolhido no passado. Etapa R5.2 tentou um meio-termo
// (guardar o ponto exato de onde o usuário ligou, só recalculando quando o outro lado cruzava
// pro lado OPOSTO) — usuário reportou que ainda não adaptava bem ("tem que se adaptar conforme
// a posição de ambos ligados se encontra... não só a seta em si"): qualquer reposicionamento
// que NÃO cruzasse esse limiar de 180° deixava a âncora births num ponto cada vez mais
// artificial em relação à geometria atual. Sempre recalcular é mais simples E mais correto —
// `RabiscoBinding.fx/fy` (calculado por `bindingAt` no momento de ligar) fica sem uso pra
// posicionar (mantido no tipo/dados só por compatibilidade — nada mais lê esses dois campos).
function bindPoint(shape: RabiscoElement, from: [number, number], all: RabiscoElement[]): [number, number] {
  const g = bounds(shape, all), cx = g.x + g.w / 2, cy = g.y + g.h / 2;
  const c = { x: cx, y: cy };
  if (insideShape(shape, { x: from[0], y: from[1] }, all)) return [c.x, c.y];
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const k = (lo + hi) / 2;
    const q = { x: from[0] + (c.x - from[0]) * k, y: from[1] + (c.y - from[1]) * k };
    if (insideShape(shape, q, all)) hi = k; else lo = k;
  }
  const bx = from[0] + (c.x - from[0]) * hi, by = from[1] + (c.y - from[1]) * hi;
  const dx = c.x - from[0], dy = c.y - from[1], L = Math.hypot(dx, dy) || 1;
  return [bx - (dx / L) * GAP, by - (dy / L) * GAP];
}

export function bindTarget(b: RabiscoBinding | null, all: RabiscoElement[]): RabiscoElement | null {
  if (!b) return null;
  return all.find((e) => e.id === b.id && BINDABLE.has(e.type)) || null;
}

// Lado da forma mais perto do ponto de ancoragem ('h' = leste/oeste, 'v' = norte/sul) — decide
// se o cotovelo sai na horizontal ou vertical primeiro. Porte de `headingAt`
// (whiteboard-ios.html:887-892).
function headingAt(shape: RabiscoElement | null, pt: [number, number], all: RabiscoElement[]): 'h' | 'v' | null {
  if (!shape) return null;
  const g = bounds(shape, all), cx = g.x + g.w / 2, cy = g.y + g.h / 2;
  return Math.abs(pt[0] - cx) / (g.w / 2 || 1) >= Math.abs(pt[1] - cy) / (g.h / 2 || 1) ? 'h' : 'v';
}
// Roteamento em cotovelo (dois segmentos retos em ângulo reto) entre `a` e `b`, usando o lado
// de saída de cada ponta quando ancorada — porte de `elbowRoute` (whiteboard-ios.html:893-903).
// Sem o parâmetro `bend` do protótipo (separa setas irmãs que roteiam pelo mesmo caminho) —
// refinamento visual, não essencial pro roteamento em si.
function elbowRoute(a: [number, number], b: [number, number], ha: 'h' | 'v' | null, hb: 'h' | 'v' | null): [number, number][] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (Math.abs(dx) < 1 || Math.abs(dy) < 1) return [a, b];
  let pts: [number, number][];
  if (ha && hb && ha !== hb) {
    // As DUAS pontas ancoradas, cada uma pedindo um eixo de saída/entrada DIFERENTE — bug real
    // reportado (item 3/4): a versão antiga só olhava pro lado de PARTIDA pra escolher o
    // formato do caminho inteiro (`startH` dependia só de `ha`), ignorando o que o lado de
    // CHEGADA precisava — se ele queria entrar pelo eixo contrário, a última perna do caminho
    // nunca batia com a borda onde a ponta estava ancorada ali, mesmo com o PONTO certo (a
    // Etapa R5.2 já corrigia qual lado da forma vira âncora — isso aqui é uma camada diferente,
    // é o FORMATO do caminho que ligava os dois lados). Um cotovelo só (um ângulo reto), na
    // esquina que satisfaz os dois eixos ao mesmo tempo, resolve sem precisar de mais curvas.
    pts = ha === 'v' ? [a, [a[0], b[1]], b] : [a, [b[0], a[1]], b];
  } else {
    // Mesmo eixo dos dois lados, ou só um lado (ou nenhum) ancorado — desvio de 3 segmentos
    // (dogleg) pelo meio, na direção de quem tem uma preferência (comportamento de sempre).
    const startH = ha ? ha === 'h' : (hb ? hb !== 'h' : Math.abs(dx) >= Math.abs(dy));
    pts = startH
      ? [a, [a[0] + dx / 2, a[1]], [a[0] + dx / 2, b[1]], b]
      : [a, [a[0], a[1] + dy / 2], [b[0], a[1] + dy / 2], b];
  }
  return pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 0.5);
}

// Pontos absolutos já com ancoragem e roteamento em cotovelo aplicados.
export function resolvedPoints(el: RabiscoElement, all: RabiscoElement[]): [number, number][] | null {
  if (!el.points) return null;
  const pts = el.points.map((q) => [el.x + q[0], el.y + q[1]] as [number, number]);
  if (!LINEAR.has(el.type) || pts.length < 2) return pts;
  const sb = bindTarget(el.startBinding, all), eb = bindTarget(el.endBinding, all);
  if (sb) pts[0] = bindPoint(sb, pts[1], all);
  if (eb) pts[pts.length - 1] = bindPoint(eb, pts[pts.length - 2], all);
  if (el.arrowType === 'elbow') {
    const a = pts[0], b = pts[pts.length - 1];
    return elbowRoute(a, b, headingAt(sb, a, all), headingAt(eb, b, all));
  }
  return pts;
}

// Ângulo de apontamento da ponta da seta — sempre a direção do ÚLTIMO SEGMENTO desenhado. Reto/
// curvo não têm outra opção (é a única linha visível). Cotovelo (ângulo reto) TAMBÉM sempre —
// por construção, esse segmento só existe horizontal OU vertical (`elbowRoute`), nunca numa
// diagonal torta, e as Etapas R5.2-R5.4 já garantem que ele sai alinhado com o lado da forma
// onde a ponta está ancorada (a âncora em si é sempre recalculada pra encarar quem a está
// puxando, e o formato do cotovelo respeita o eixo de saída/entrada dos dois lados). Uma versão
// anterior desviava desse padrão pra apontar direto pro CENTRO da forma-alvo, só pro caso
// cotovelo+ancorado — fazia sentido enquanto o roteamento podia produzir uma última perna torta
// em relação à âncora (bug real, já corrigido nas etapas de cima); mantê-lo depois disso só
// desalinhava a ponta ("v") do próprio traço numa diagonal nem sempre múltipla de 90°, deixando
// ela com aparência torta — outro bug real reportado, revertido aqui.
export function arrowHeadAngle(abs: [number, number][]): number {
  const [ax, ay] = abs[abs.length - 2];
  const [bx, by] = abs[abs.length - 1];
  return Math.atan2(by - ay, bx - ax);
}

// ---- geometria completa de um elemento (stroke + fill) --------------------
export interface ElementGeometry {
  g: { x: number; y: number; w: number; h: number };
  stroke: string;
  clip: string;
  hatch: string;
  fillKind: 'solid' | 'hatch' | null;
  arrowHeads: string;
}

export function elementGeometry(el: RabiscoElement, all: RabiscoElement[]): ElementGeometry {
  const g = bounds(el, all);
  const out: ElementGeometry = { g, stroke: '', clip: '', hatch: '', fillKind: null, arrowHeads: '' };
  if (el.type === 'text') return out;

  if (el.type === 'rect' || el.type === 'ellipse' || el.type === 'diamond') {
    out.clip = solidD(el, all);
    if (el.bgColor !== 'transparent') {
      if (el.fillStyle === 'solid') out.fillKind = 'solid';
      else { out.fillKind = 'hatch'; out.hatch = hachureD(el, all); }
    }
  }

  const rnd = mulberry32(el.seed), r = el.roughness, p = pathBuilder();
  const rad = cornerRadius(el, all);

  if (el.type === 'rect' || el.type === 'diamond') {
    const pts = polyOf(el, all)!;
    if (rad > 0.5) roughRoundPoly(p, pts, rad, r, rnd);
    else roughPoly(p, [...pts, pts[0]], r, rnd);
  } else if (el.type === 'ellipse') {
    roughEllipse(p, g.x + g.w / 2, g.y + g.h / 2, g.w / 2, g.h / 2, r, rnd);
  } else if (el.type === 'draw') {
    if (!el.points || !el.points.length) return out;
    const abs = el.points.map((q) => [el.x + q[0], el.y + q[1]] as [number, number]);
    if (abs.length === 1) { out.stroke = ellipseD(abs[0][0], abs[0][1], el.strokeWidth * 0.5, el.strokeWidth * 0.5); return out; }
    smooth(p, abs);
  } else if (LINEAR.has(el.type)) {
    const abs = resolvedPoints(el, all);
    if (!abs || abs.length < 2) return out;
    if (el.arrowType === 'curved' && abs.length > 2) roughCurve(p, abs, r, rnd);
    else roughPoly(p, abs, r, rnd);

    if (el.type === 'arrow') {
      const [bx, by] = abs[abs.length - 1];
      const a = arrowHeadAngle(abs);
      const [ax, ay] = abs[abs.length - 2];
      const L = Math.min(34, Math.max(10, Math.hypot(bx - ax, by - ay) * 0.28));
      const heads = pathBuilder();
      roughSeg(heads, bx, by, bx - Math.cos(a - 0.42) * L, by - Math.sin(a - 0.42) * L, r, rnd);
      roughSeg(heads, bx, by, bx - Math.cos(a + 0.42) * L, by - Math.sin(a + 0.42) * L, r, rnd);
      out.arrowHeads = heads.d;
    }
  }
  out.stroke = p.d;
  return out;
}

// Path do traço (compatibilidade — usado pelo traço em progresso, que não tem os outros
// elementos do doc pra resolver binding).
export function strokePath(el: RabiscoElement): string {
  return elementGeometry(el, []).stroke;
}

// ---- seleção (hit-test) ----------------------------------------------------
// Qual elemento está sob um ponto de cena, do mais recente (por cima) pro mais antigo — mesmo
// espírito de `pick()` do protótipo, mas escrito puro (sem depender de `S` global) pra ficar
// testável sem canvas nenhum.
function distToSegment(p: { x: number; y: number }, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  let t = L ? ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / L : 0;
  t = Math.min(1, Math.max(0, t));
  const qx = a[0] + dx * t, qy = a[1] + dy * t;
  return Math.hypot(p.x - qx, p.y - qy);
}

// Borda de uma forma SEM preenchimento: dentro da caixa (+tol) mas fora do miolo (-tol) —
// um anel/moldura em volta do contorno. Porte de `hit()` (whiteboard-ios.html:1324-1353).
function nearShapeBorder(el: RabiscoElement, p: { x: number; y: number }, g: { x: number; y: number; w: number; h: number }, tol: number): boolean {
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
  if (el.type === 'ellipse') {
    const k = ((p.x - cx) / (g.w / 2 + tol)) ** 2 + ((p.y - cy) / (g.h / 2 + tol)) ** 2;
    const kin = ((p.x - cx) / Math.max(g.w / 2 - tol, 1)) ** 2 + ((p.y - cy) / Math.max(g.h / 2 - tol, 1)) ** 2;
    return k <= 1 && kin >= 1;
  }
  if (el.type === 'diamond') {
    const k = Math.abs(p.x - cx) / (g.w / 2 + tol) + Math.abs(p.y - cy) / (g.h / 2 + tol);
    const kin = Math.abs(p.x - cx) / Math.max(g.w / 2 - tol, 1) + Math.abs(p.y - cy) / Math.max(g.h / 2 - tol, 1);
    return k <= 1 && kin >= 1;
  }
  const near = (a: number, b: number) => Math.abs(a - b) < tol;
  const inX = p.x > g.x - tol && p.x < g.x + g.w + tol, inY = p.y > g.y - tol && p.y < g.y + g.h + tol;
  return (inY && (near(p.x, g.x) || near(p.x, g.x + g.w))) || (inX && (near(p.y, g.y) || near(p.y, g.y + g.h)));
}

// Duas passadas, igual ao protótipo (`hit`+`hitLoose`+`pick`, whiteboard-ios.html:1324-1369):
// primeiro o alvo preciso (traço, forma preenchida ou rotulada, borda de forma vazia); só se
// nada precisou é que o miolo vazio de uma forma sem preenchimento conta — senão uma forma
// grande e vazia bloqueia selecionar qualquer coisa desenhada por cima/dentro dela.
export function hitTest(elements: RabiscoElement[], p: { x: number; y: number }, zoom: number): RabiscoElement | null {
  const tol = 14 / zoom;
  const precise = (el: RabiscoElement): boolean => {
    if (el.type === 'text') {
      const g = bounds(el, elements);
      const lp = toElementLocal(el, p, elements);
      return lp.x >= g.x - tol && lp.x <= g.x + g.w + tol && lp.y >= g.y - tol && lp.y <= g.y + g.h + tol;
    }
    if (el.type === 'rect' || el.type === 'diamond' || el.type === 'ellipse') {
      const g = bounds(el, elements);
      const lp = toElementLocal(el, p, elements);
      if (lp.x < g.x - tol || lp.x > g.x + g.w + tol || lp.y < g.y - tol || lp.y > g.y + g.h + tol) return false;
      const filled = el.bgColor !== 'transparent' || !!el.text;
      return filled ? insideShape(el, lp, elements, tol) : nearShapeBorder(el, lp, g, tol);
    }
    const pts = el.type === 'draw'
      ? (el.points || []).map((q) => [el.x + q[0], el.y + q[1]] as [number, number])
      : resolvedPoints(el, elements);
    if (!pts || !pts.length) return false;
    if (pts.length === 1) return Math.hypot(p.x - pts[0][0], p.y - pts[0][1]) <= tol;
    const hitTol = tol + Math.max(el.strokeWidth, 2);
    for (let j = 0; j < pts.length - 1; j++) if (distToSegment(p, pts[j], pts[j + 1]) <= hitTol) return true;
    return false;
  };
  for (let i = elements.length - 1; i >= 0; i--) if (precise(elements[i])) return elements[i];
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!LABELABLE.has(el.type) || el.bgColor !== 'transparent' || el.text) continue;
    if (insideShape(el, toElementLocal(el, p, elements), elements)) return el;
  }
  return null;
}

export { LINEAR, LABELABLE, BINDABLE, ROTATABLE };
export type { RabiscoArrowType };
