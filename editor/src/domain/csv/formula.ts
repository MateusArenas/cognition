// Motor de fórmulas — parser recursivo descendente, sem eval(). Porte quase literal de
// tabelas.html (protótipo de referência). Erros são strings ("#DIV/0!" etc.) pra célula só
// precisar checar valor[0] === '#' e pintar de vermelho — nunca lança pra fora de evalFormula.
//
// Decimal em FÓRMULA é sempre ponto ("=1.5*2"): a vírgula já é separador de argumento (usuário
// brasileiro digita ";" OU "," por hábito do Excel — as duas são aceitas). Na CÉLULA (valor
// literal, fora de fórmula), vírgula decimal é aceita via numval().

export type FormulaGetter = (row: number, col: number) => unknown;

const FUNCS: Record<string, (args: number[]) => number> = {
  SUM: (a) => a.reduce((s, v) => s + v, 0),
  SOMA: (a) => a.reduce((s, v) => s + v, 0),
  AVERAGE: (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0),
  MEDIA: (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0),
  MÉDIA: (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0),
  MIN: (a) => (a.length ? Math.min(...a) : 0),
  MAX: (a) => (a.length ? Math.max(...a) : 0),
  COUNT: (a) => a.length,
  CONT: (a) => a.length,
  'CONT.NÚM': (a) => a.length,
  ABS: (a) => Math.abs(a[0]),
  ROUND: (a) => {
    const d = a[1] || 0;
    const p = Math.pow(10, d);
    return Math.round(a[0] * p) / p;
  },
  ARRED: (a) => {
    const d = a[1] || 0;
    const p = Math.pow(10, d);
    return Math.round(a[0] * p) / p;
  },
  INT: (a) => Math.trunc(a[0]),
  SQRT: (a) => Math.sqrt(a[0]),
  RAIZ: (a) => Math.sqrt(a[0]),
  PRODUCT: (a) => a.reduce((s, v) => s * v, 1),
  MULT: (a) => a.reduce((s, v) => s * v, 1),
};
const LOGIC = new Set(['IF', 'SE']);

export class FormulaError extends Error {}

export function numval(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v == null) return null;
  let t = String(v).trim();
  if (!t) return null;
  t = t.replace(/^R\$\s*/i, '').replace(/\s/g, '').replace(/%$/, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return parseFloat(t);
  return null;
}

export function fmtNum(n: number): string {
  if (Number.isNaN(n)) return '#NÚM!';
  if (!isFinite(n)) return '#DIV/0!';
  return Math.abs(n) >= 1e12 || (Math.abs(n) < 1e-6 && n !== 0)
    ? n.toExponential(4)
    : n.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
}

export function colName(i: number): string {
  let s = '';
  i++;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = (i - m - 1) / 26;
  }
  return s;
}

export function colIndex(s: string): number {
  let n = 0;
  for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function parseRef(s: string): { r: number; c: number } {
  const m = /^([A-Z]+)([0-9]+)$/.exec(s);
  if (!m) throw new FormulaError('#REF!');
  return { c: colIndex(m[1]), r: parseInt(m[2], 10) - 1 };
}

type Token = { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'ref'; v: string } | { k: 'id'; v: string } | { k: 'op'; v: string };

function tokenize(src: string): Token[] {
  const t: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"') {
      let s = '';
      i++;
      while (i < src.length && src[i] !== '"') s += src[i++];
      i++;
      t.push({ k: 'str', v: s });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let s = '';
      while (i < src.length && /[0-9.]/.test(src[i])) s += src[i++];
      t.push({ k: 'num', v: parseFloat(s) });
      continue;
    }
    if (/[A-Za-zÀ-ÿ_]/.test(c)) {
      let s = '';
      while (i < src.length && /[A-Za-zÀ-ÿ0-9_.]/.test(src[i])) s += src[i++];
      if (/^[A-Za-z]{1,3}[0-9]{1,5}$/.test(s)) t.push({ k: 'ref', v: s.toUpperCase() });
      else t.push({ k: 'id', v: s.toUpperCase() });
      continue;
    }
    if (c === '<' && src[i + 1] === '=') {
      t.push({ k: 'op', v: '<=' });
      i += 2;
      continue;
    }
    if (c === '>' && src[i + 1] === '=') {
      t.push({ k: 'op', v: '>=' });
      i += 2;
      continue;
    }
    if (c === '<' && src[i + 1] === '>') {
      t.push({ k: 'op', v: '<>' });
      i += 2;
      continue;
    }
    if ('+-*/^()=<>:,;&'.includes(c)) {
      t.push({ k: 'op', v: c });
      i++;
      continue;
    }
    throw new FormulaError('#SINTAXE');
  }
  return t;
}

type Cell = number | string | boolean | Cell[];

export function evalFormula(src: string, get: FormulaGetter): Cell {
  const t = tokenize(src);
  let p = 0;
  const peek = () => t[p];
  const eat = (v: string) => {
    if (t[p] && t[p].v === v) {
      p++;
      return true;
    }
    return false;
  };
  const flat = (v: Cell): Cell[] => (Array.isArray(v) ? v : [v]);
  const num = (v: Cell): number => {
    if (Array.isArray(v)) throw new FormulaError('#VALOR!');
    const n = typeof v === 'number' ? v : numval(v);
    return n == null ? 0 : n;
  };
  const disp = (v: Cell): string => (typeof v === 'number' ? fmtNum(v) : typeof v === 'boolean' ? (v ? 'VERDADEIRO' : 'FALSO') : String(v));

  const opAhead = (vals: string[]): boolean => {
    const pk = peek();
    return !!pk && pk.k === 'op' && vals.includes(pk.v);
  };
  const eatOp = (): string => (t[p++] as { k: 'op'; v: string }).v;

  function cmp(): Cell {
    let l = add();
    while (opAhead(['=', '<', '>', '<=', '>=', '<>'])) {
      const o = eatOp();
      const r = add();
      const a = typeof l === 'number' || numval(l) != null ? num(l) : disp(l).toLowerCase();
      const b = typeof r === 'number' || numval(r) != null ? num(r) : disp(r).toLowerCase();
      l = o === '=' ? a === b : o === '<>' ? a !== b : o === '<' ? a < b : o === '>' ? a > b : o === '<=' ? a <= b : a >= b;
    }
    return l;
  }
  function add(): Cell {
    let l = mul();
    while (opAhead(['+', '-', '&'])) {
      const o = eatOp();
      const r = mul();
      l = o === '&' ? disp(l) + disp(r) : o === '+' ? num(l) + num(r) : num(l) - num(r);
    }
    return l;
  }
  function mul(): Cell {
    let l = unary();
    while (opAhead(['*', '/'])) {
      const o = eatOp();
      const r = unary();
      if (o === '/' && num(r) === 0) throw new FormulaError('#DIV/0!');
      l = o === '*' ? num(l) * num(r) : num(l) / num(r);
    }
    return l;
  }
  function unary(): Cell {
    if (eat('-')) return -num(unary());
    if (eat('+')) return num(unary());
    return power();
  }
  function power(): Cell {
    const l = primary();
    if (eat('^')) return Math.pow(num(l), num(unary()));
    return l;
  }
  function primary(): Cell {
    const tk = t[p];
    if (!tk) throw new FormulaError('#SINTAXE');
    if (tk.k === 'num' || tk.k === 'str') {
      p++;
      return tk.v;
    }
    if (tk.k === 'ref') {
      p++;
      const nextTok = t[p + 1];
      if (peek()?.v === ':' && nextTok && nextTok.k === 'ref') {
        p++;
        const b = (t[p++] as { k: 'ref'; v: string }).v;
        return rangeVals(tk.v, b);
      }
      const { r, c } = parseRef(tk.v);
      return get(r, c) as Cell;
    }
    if (tk.k === 'id') {
      const name = tk.v;
      p++;
      if (!eat('(')) throw new FormulaError('#NOME?');
      const args: Cell[] = [];
      if (!eat(')')) {
        do {
          args.push(cmp());
        } while (eat(',') || eat(';'));
        if (!eat(')')) throw new FormulaError('#SINTAXE');
      }
      if (LOGIC.has(name)) return args[0] ? (args[1] !== undefined ? args[1] : true) : args[2] !== undefined ? args[2] : false;
      const fn = FUNCS[name];
      if (!fn) throw new FormulaError('#NOME?');
      const nums: number[] = [];
      args.forEach((a) =>
        flat(a).forEach((v) => {
          const n = typeof v === 'number' ? v : numval(v as string);
          if (n != null) nums.push(n);
        })
      );
      return fn(nums);
    }
    if (eat('(')) {
      const v = cmp();
      if (!eat(')')) throw new FormulaError('#SINTAXE');
      return v;
    }
    throw new FormulaError('#SINTAXE');
  }
  function rangeVals(a: string, b: string): Cell[] {
    const A = parseRef(a);
    const B = parseRef(b);
    const out: Cell[] = [];
    for (let r = Math.min(A.r, B.r); r <= Math.max(A.r, B.r); r++)
      for (let c = Math.min(A.c, B.c); c <= Math.max(A.c, B.c); c++) out.push(get(r, c) as Cell);
    return out;
  }
  const v = cmp();
  if (p < t.length) throw new FormulaError('#SINTAXE');
  return Array.isArray(v) ? (v[0] !== undefined ? v[0] : 0) : v;
}

export const isFormulaErr = (v: unknown): v is string => typeof v === 'string' && v[0] === '#';

// Avaliador de uma tabela inteira — cache por célula + detecção de ciclo (Set de células em
// visita: se reentrar, devolve "#CICLO" em vez de estourar a pilha). Sem grafo de dependências
// no MVP — invalidar tudo a cada evaluateSheet() e recalcular só o que é lido é suficiente até
// ~50k células (mesma decisão do protótipo de referência). Uma instância nova por render/export
// — nunca compartilhada entre "fotos" diferentes da tabela.
export function evaluateSheet(cells: string[][]) {
  const cache = new Map<string, Cell>();
  const visiting = new Set<string>();

  function raw(r: number, c: number): string {
    const row = cells[r];
    return row && row[c] != null ? row[c] : '';
  }

  function value(r: number, c: number): Cell {
    const key = r + ':' + c;
    if (cache.has(key)) return cache.get(key)!;
    const v = raw(r, c);
    if (typeof v !== 'string' || v[0] !== '=') {
      const n = numval(v);
      const out = n != null ? n : v;
      cache.set(key, out);
      return out;
    }
    if (visiting.has(key)) return '#CICLO';
    visiting.add(key);
    let out: Cell;
    try {
      out = evalFormula(v.slice(1), value);
    } catch (e) {
      out = e instanceof FormulaError ? e.message : '#ERRO';
    }
    visiting.delete(key);
    if (typeof out === 'number' && !isFinite(out)) out = Number.isNaN(out) ? '#NÚM!' : '#DIV/0!';
    cache.set(key, out);
    return out;
  }

  function shown(r: number, c: number): string {
    const v = value(r, c);
    if (typeof v === 'number') return fmtNum(v);
    if (typeof v === 'boolean') return v ? 'VERDADEIRO' : 'FALSO';
    return typeof v === 'string' ? v : '';
  }

  return { raw, value, shown };
}

// Desloca referências de fórmula relativas em `d` linhas — usado por "preencher para baixo"
// (mutations.ts, fillDown). Só mexe em fórmulas ("=..."); qualquer outro valor volta intocado.
export function shiftFormula(src: string, d: number): string {
  if (typeof src !== 'string' || src[0] !== '=') return src;
  return src.replace(/\b([A-Z]{1,3})([0-9]{1,5})\b/g, (_m, a: string, b: string) => a + (parseInt(b, 10) + d));
}
