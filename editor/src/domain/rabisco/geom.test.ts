import { describe, expect, it } from 'vitest';
import {
  arrowHeadAngle, bindingAt, bounds, boundsOfSelection, cornerRadius, elementGeometry, ellipseD, hitTest, insideShape,
  normalizeElement, pickBindable, resolvedPoints, smooth, pathBuilder, strokePath, toElementLocal,
} from './geom';
import { defaultElementStyle } from './palette';
import type { RabiscoElement } from '../types';

function traco(points: [number, number][]): RabiscoElement {
  return {
    id: 'el1', type: 'draw', x: 0, y: 0, w: 0, h: 0,
    points, text: '', labelColor: '#000',
    startBinding: null, endBinding: null, groupId: null,
    seed: 1, version: 1,
    ...defaultElementStyle('#1B1B1F'),
  };
}

describe('domain/rabisco/geom', () => {
  it('pathBuilder emite comandos SVG', () => {
    const p = pathBuilder();
    p.m(1, 2);
    p.l(3, 4);
    expect(p.d).toBe('M1 2L3 4');
  });

  it('smooth começa em M e termina em L no último ponto', () => {
    const p = pathBuilder();
    smooth(p, [[0, 0], [10, 0], [20, 10]]);
    expect(p.d.startsWith('M0 0')).toBe(true);
    expect(p.d.endsWith('L20 10')).toBe(true);
  });

  it('smooth com menos de 2 pontos não desenha nada', () => {
    const p = pathBuilder();
    smooth(p, [[0, 0]]);
    expect(p.d).toBe('');
  });

  it('ellipseD fecha o path (termina em Z)', () => {
    expect(ellipseD(0, 0, 5, 5).endsWith('Z')).toBe(true);
  });

  it('strokePath de um traço com 1 ponto vira um pontinho (elipse)', () => {
    const d = strokePath(traco([[0, 0]]));
    expect(d.endsWith('Z')).toBe(true);
  });

  it('strokePath de um traço com vários pontos usa smooth (M seguido de Q/L)', () => {
    const d = strokePath(traco([[0, 0], [5, 5], [10, 0]]));
    expect(d.startsWith('M')).toBe(true);
    expect(d).toContain('Q');
  });

  it('strokePath de um traço sem pontos volta vazio', () => {
    expect(strokePath(traco([]))).toBe('');
  });
});

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

function seta(x: number, y: number, points: [number, number][], extra: Partial<RabiscoElement> = {}): RabiscoElement {
  return {
    id: extra.id || 'a1', type: 'arrow', x, y, w: 0, h: 0,
    points, text: '', labelColor: '#000',
    startBinding: null, endBinding: null, groupId: null,
    seed: 1, version: 1,
    ...defaultElementStyle('#1B1B1F'),
    ...extra,
  };
}

describe('domain/rabisco/geom — formas', () => {
  it('bounds normaliza w/h negativos', () => {
    const r = forma('rect', 100, 100, -50, -30);
    const g = bounds(r);
    expect(g).toEqual({ x: 50, y: 70, w: 50, h: 30 });
  });

  it('normalizeElement resolve x/y/w/h negativos de um rascunho', () => {
    const r = forma('rect', 100, 100, -50, -30);
    const n = normalizeElement(r);
    expect(n.x).toBe(50);
    expect(n.y).toBe(70);
    expect(n.w).toBe(50);
    expect(n.h).toBe(30);
  });

  it('normalizeElement não mexe em elemento com points (traço/linear)', () => {
    const l = seta(0, 0, [[0, 0], [10, 10]]);
    expect(normalizeElement(l)).toBe(l);
  });

  it('cornerRadius só se aplica com edges round em rect/diamond', () => {
    const sharp = forma('rect', 0, 0, 100, 100, { edges: 'sharp' });
    const round = forma('rect', 0, 0, 100, 100, { edges: 'round' });
    const ellipse = forma('ellipse', 0, 0, 100, 100, { edges: 'round' });
    expect(cornerRadius(sharp)).toBe(0);
    expect(cornerRadius(round)).toBeGreaterThan(0);
    expect(cornerRadius(ellipse)).toBe(0);
  });

  it('elementGeometry de um retângulo gera stroke e clip', () => {
    const r = forma('rect', 0, 0, 100, 60);
    const geo = elementGeometry(r, [r]);
    expect(geo.stroke.length).toBeGreaterThan(0);
    expect(geo.clip.length).toBeGreaterThan(0);
  });

  it('elementGeometry com bgColor sólido marca fillKind solid', () => {
    const r = forma('rect', 0, 0, 100, 60, { bgColor: '#FFD8D6', fillStyle: 'solid' });
    expect(elementGeometry(r, [r]).fillKind).toBe('solid');
  });

  it('elementGeometry com bgColor hachurado marca fillKind hatch e gera hatch', () => {
    const r = forma('rect', 0, 0, 100, 60, { bgColor: '#FFD8D6', fillStyle: 'hachure' });
    const geo = elementGeometry(r, [r]);
    expect(geo.fillKind).toBe('hatch');
    expect(geo.hatch.length).toBeGreaterThan(0);
  });

  it('elementGeometry de uma seta gera as duas farpas (arrowHeads)', () => {
    const a = seta(0, 0, [[0, 0], [100, 0]]);
    const geo = elementGeometry(a, [a]);
    expect(geo.arrowHeads.length).toBeGreaterThan(0);
  });

  it('boundsOfSelection cobre vários elementos', () => {
    const r1 = forma('rect', 0, 0, 10, 10, { id: 'r1' });
    const r2 = forma('rect', 50, 50, 10, 10, { id: 'r2' });
    const g = boundsOfSelection([r1, r2], [r1, r2]);
    expect(g).toEqual({ x: 0, y: 0, w: 60, h: 60 });
  });
});

describe('domain/rabisco/geom — ligação (binding)', () => {
  it('insideShape reconhece ponto dentro de um retângulo', () => {
    const r = forma('rect', 0, 0, 100, 100);
    expect(insideShape(r, { x: 50, y: 50 }, [r])).toBe(true);
    expect(insideShape(r, { x: 200, y: 200 }, [r])).toBe(false);
  });

  it('insideShape reconhece ponto dentro de uma elipse', () => {
    const e = forma('ellipse', 0, 0, 100, 100);
    expect(insideShape(e, { x: 50, y: 50 }, [e])).toBe(true);
    expect(insideShape(e, { x: 2, y: 2 }, [e])).toBe(false);
  });

  it('pickBindable acha a forma sob o ponto, ignorando o id excluído', () => {
    const r = forma('rect', 0, 0, 100, 100, { id: 'r1' });
    expect(pickBindable({ x: 50, y: 50 }, [r], null, 1)?.id).toBe('r1');
    expect(pickBindable({ x: 50, y: 50 }, [r], 'r1', 1)).toBeNull();
  });

  it('pickBindable sem currentId solta assim que sai dos 10px (sem histerese)', () => {
    const r = forma('rect', 0, 0, 100, 100, { id: 'r1' });
    expect(pickBindable({ x: 115, y: 50 }, [r], null, 1)).toBeNull();
  });

  it('pickBindable com currentId segura o alvo já ligado até sair de 22px (histerese)', () => {
    const r = forma('rect', 0, 0, 100, 100, { id: 'r1' });
    // 15px fora da borda: fora do raio de PRENDER (10px), mas dentro do de SOLTAR (22px) —
    // sem currentId teria voltado null; com currentId, segura o alvo já ligado.
    expect(pickBindable({ x: 115, y: 50 }, [r], null, 1, 'r1')?.id).toBe('r1');
    // 30px fora: além dos 22px, solta mesmo com currentId.
    expect(pickBindable({ x: 130, y: 50 }, [r], null, 1, 'r1')).toBeNull();
  });

  it('bindingAt calcula fx/fy normalizados na borda mais próxima', () => {
    const r = forma('rect', 0, 0, 100, 100, { id: 'r1' });
    const b = bindingAt(r, { x: 100, y: 50 }, [r]);
    expect(b.id).toBe('r1');
    expect(b.fx).toBeCloseTo(1, 1);
    expect(b.fy).toBeCloseTo(0, 1);
  });

  it('resolvedPoints gruda a ponta da seta na borda da forma ligada', () => {
    const target = forma('rect', 100, 0, 50, 50, { id: 'target' });
    const a = seta(0, 0, [[0, 25], [100, 25]], { endBinding: { id: 'target', fx: -1, fy: 0 } });
    const pts = resolvedPoints(a, [a, target]);
    expect(pts).not.toBeNull();
    // A ponta deve ficar perto da borda esquerda do alvo (x=100), não no ponto bruto original (x=100 também, mas a "folga" GAP a afasta pra ~94).
    expect(pts![1][0]).toBeLessThan(100);
    expect(pts![1][0]).toBeGreaterThan(80);
  });

  it('resolvedPoints sem binding devolve os pontos brutos', () => {
    const a = seta(0, 0, [[0, 0], [50, 50]]);
    expect(resolvedPoints(a, [a])).toEqual([[0, 0], [50, 50]]);
  });

  it('resolvedPoints com arrowType elbow roteia em ângulo reto (4 pontos)', () => {
    const a = seta(0, 0, [[0, 0], [100, 60]], { arrowType: 'elbow' });
    const pts = resolvedPoints(a, [a])!;
    expect(pts.length).toBe(4);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[3]).toEqual([100, 60]);
    // segmento do meio é vertical (mesmo x nos dois pontos internos) ou horizontal (mesmo y) —
    // um cotovelo nunca é uma diagonal reta.
    const horizontal = pts[1][1] === pts[2][1];
    const vertical = pts[1][0] === pts[2][0];
    expect(horizontal || vertical).toBe(true);
  });

  it('resolvedPoints com arrowType elbow e ligação continua em ângulo reto até o alvo', () => {
    const target = forma('rect', 200, 0, 50, 50, { id: 'target' });
    const a = seta(0, 20, [[0, 0], [200, 5]], {
      arrowType: 'elbow',
      endBinding: { id: 'target', fx: -1, fy: 0 },
    });
    const pts = resolvedPoints(a, [a, target])!;
    expect(pts.length).toBe(4);
    // cada segmento é puramente horizontal OU vertical — nunca uma diagonal.
    for (let i = 1; i < pts.length; i++) {
      const sameX = pts[i][0] === pts[i - 1][0], sameY = pts[i][1] === pts[i - 1][1];
      expect(sameX || sameY).toBe(true);
    }
    // ponta final gruda perto da borda oeste do alvo (x=200), não no ponto bruto original.
    expect(pts[3][0]).toBeLessThan(200);
    expect(pts[3][0]).toBeGreaterThan(180);
  });

  it('arrowHeadAngle reta/curva sempre segue o último segmento, ancorada ou não', () => {
    const target = forma('rect', 100, 100, 100, 100, { id: 'target' });
    const p = { x: 120, y: 105 }; // perto da borda norte, fora do centro
    const binding = bindingAt(target, p, [target]);
    const a = seta(0, 0, [[0, 0], [p.x, p.y]], { endBinding: binding });
    const abs = resolvedPoints(a, [a, target])!;
    const [ax, ay] = abs[abs.length - 2], [bx, by] = abs[abs.length - 1];
    const expected = Math.atan2(by - ay, bx - ax);
    expect(arrowHeadAngle(abs)).toBeCloseTo(expected, 10);
  });

  it('arrowHeadAngle de cotovelo ligado é sempre múltiplo de 90° — bug real: apontar pro ' +
    'CENTRO da forma-alvo (versão anterior, Etapa R4) desalinhava a ponta ("v") do segmento ' +
    'reto onde ela está grudada, deixando um dos dois traços do "v" com aparência torta; agora ' +
    'segue o último segmento igual seta reta/curva — e esse segmento só existe horizontal ou ' +
    'vertical por construção do cotovelo, então a ponta nunca fica numa diagonal torta', () => {
    const src = forma('rect', 0, 200, 200, 50, { id: 'src' });
    const target = forma('rect', 250, 0, 50, 200, { id: 'target' });
    const a = seta(0, 0, [[100, 225], [275, 100]], {
      arrowType: 'elbow',
      startBinding: { id: 'src' },
      endBinding: { id: 'target' },
    });
    const abs = resolvedPoints(a, [a, src, target])!;
    const angle = arrowHeadAngle(abs);
    // sin(2·ângulo) só é zero em múltiplos de 90° — checagem livre do problema de módulo perto
    // da borda (89.999999 % 90 não fica perto de 0, mesmo sendo "essencialmente" 90°).
    expect(Math.abs(Math.sin(angle * 2))).toBeLessThan(1e-9);
  });

  it('resolvedPoints sempre recalcula a âncora a partir da posição ATUAL do outro extremo — ' +
    'bug real relatado pelo usuário duas vezes ("a seta ainda buga" / "a âncora... tem que se ' +
    'adaptar conforme a posição de ambos"): guardar um ponto fixo escolhido no passado (mesmo ' +
    'só trocando de lado quando cruzava 180°, tentativa da Etapa R5.2) nunca acompanhava direito ' +
    'um reposicionamento contínuo — só recalcular do zero toda vez resolve de verdade', () => {
    const target = forma('rect', 0, 0, 100, 100, { id: 'target' });
    const a = seta(0, 0, [[50, 500], [0, 0]], { endBinding: { id: 'target' } });
    // De baixo: âncora tem que ficar perto da borda de BAIXO (y perto de 100).
    expect(resolvedPoints(a, [a, target])![1][1]).toBeGreaterThan(90);
    // O mesmo elemento, só que agora vindo de CIMA: âncora acompanha, vai pra borda de CIMA
    // (y perto de 0) — nenhum estado guardado do cálculo anterior interfere.
    const b = seta(0, 0, [[50, -100], [0, 0]], { endBinding: { id: 'target' } });
    expect(resolvedPoints(b, [b, target])![1][1]).toBeLessThan(10);
  });

  it('resolvedPoints com arrowType elbow e as duas pontas ancoradas em eixos DIFERENTES usa um ' +
    'cotovelo só que satisfaz os dois lados — bug real: antes só o lado de PARTIDA escolhia o ' +
    'formato do caminho inteiro, ignorando o que o lado de CHEGADA precisava; se pedia o eixo ' +
    'contrário, a última perna nunca batia com a borda ancorada ali', () => {
    // Formas com proporções bem diferentes — larga-e-baixa vs. estreita-e-alta — fazem o MESMO
    // ponto de chegada normalizar pra eixos diferentes em cada uma (`headingAt` compara contra
    // a MEIA-largura/meia-altura de cada forma, não um valor absoluto), mesmo com a âncora
    // dinâmica (Etapa R5.4) sempre voltada de verdade pra quem está do outro lado.
    const src = forma('rect', 0, 200, 200, 50, { id: 'src' }); // larga e baixa
    const target = forma('rect', 250, 0, 50, 200, { id: 'target' }); // estreita e alta
    const a = seta(0, 0, [[100, 225], [275, 100]], {
      arrowType: 'elbow',
      startBinding: { id: 'src' },
      endBinding: { id: 'target' },
    });
    const pts = resolvedPoints(a, [a, src, target])!;
    expect(pts.length).toBe(3); // um cotovelo só: perna de partida + perna de chegada
    expect(pts[0][0]).toBeCloseTo(pts[1][0], 5); // 1ª perna vertical (sai reto do topo do src)
    expect(pts[1][1]).toBeCloseTo(pts[2][1], 5); // 2ª perna horizontal (entra reto no target)
  });
});

describe('domain/rabisco/geom — hitTest', () => {
  it('acha a forma sob o ponto', () => {
    const r = forma('rect', 0, 0, 100, 100, { id: 'r1' });
    expect(hitTest([r], { x: 50, y: 50 }, 1)?.id).toBe('r1');
  });

  it('devolve null quando não há nada sob o ponto', () => {
    const r = forma('rect', 0, 0, 100, 100, { id: 'r1' });
    expect(hitTest([r], { x: 500, y: 500 }, 1)).toBeNull();
  });

  it('prioriza o elemento mais recente (por cima) quando há sobreposição', () => {
    const back = forma('rect', 0, 0, 100, 100, { id: 'back' });
    const front = forma('rect', 20, 20, 60, 60, { id: 'front' });
    expect(hitTest([back, front], { x: 50, y: 50 }, 1)?.id).toBe('front');
  });

  it('acha uma linha por proximidade ao segmento, não só nos pontos', () => {
    const l = seta(0, 0, [[0, 0], [100, 0]], { type: 'line', id: 'l1' });
    expect(hitTest([l], { x: 50, y: 1 }, 1)?.id).toBe('l1');
    expect(hitTest([l], { x: 50, y: 40 }, 1)).toBeNull();
  });

  it('acha texto pela caixa (bounds)', () => {
    const t = forma('text', 0, 0, 80, 20, { id: 'txt1' });
    expect(hitTest([t], { x: 40, y: 10 }, 1)?.id).toBe('txt1');
  });

  it('forma preenchida acha pelo miolo, longe da borda', () => {
    const r = forma('rect', 0, 0, 100, 100, { bgColor: '#FFD8D6', id: 'r1' });
    expect(hitTest([r], { x: 50, y: 50 }, 1)?.id).toBe('r1');
  });

  it('forma sem preenchimento não bloqueia o que está desenhado por cima dela', () => {
    const frame = forma('rect', 0, 0, 200, 200, { id: 'frame' });
    const inner = forma('rect', 80, 80, 40, 40, { bgColor: '#FFD8D6', id: 'inner' });
    expect(hitTest([frame, inner], { x: 100, y: 100 }, 1)?.id).toBe('inner');
  });

  it('forma sem preenchimento ainda seleciona pelo miolo se não houver nada por cima', () => {
    const frame = forma('rect', 0, 0, 200, 200, { id: 'frame' });
    expect(hitTest([frame], { x: 100, y: 100 }, 1)?.id).toBe('frame');
  });

  it('toElementLocal desfaz a rotação em volta do centro da forma', () => {
    const r = forma('rect', 0, 0, 100, 100, { rotation: Math.PI / 2 }); // 90°
    // canto (100,0), girado 90° em volta do centro (50,50), cai em (100,100) no mundo — desfazer
    // a rotação (toElementLocal) tem que devolver (100,0), o canto original.
    const local = toElementLocal(r, { x: 100, y: 100 }, [r]);
    expect(local.x).toBeCloseTo(100, 5);
    expect(local.y).toBeCloseTo(0, 5);
  });

  it('hitTest acha uma forma rotacionada na posição VISUAL (girada), não na caixa crua', () => {
    // Retângulo alto e fino, 90° girado — visualmente vira largo e baixo. Um toque no canto
    // direito visual (fora da caixa crua alta-e-fina) só acha a forma se o hit-test desfizer a
    // rotação primeiro.
    const r = forma('rect', 0, 0, 20, 100, { id: 'r1', rotation: Math.PI / 2, bgColor: '#fff' });
    // centro real (10,50); girado 90°, o ponto (55,50) [40px à direita do centro, mesma altura]
    // cai dentro do retângulo girado (que agora se estende ±50 em x, ±10 em y a partir do
    // centro) mas está BEM fora da caixa crua não-girada (x:0-20).
    expect(hitTest([r], { x: 55, y: 50 }, 1)?.id).toBe('r1');
  });
});
