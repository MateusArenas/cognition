import { describe, expect, it } from 'vitest';
import { blankRabisco } from '../mermaid/factory';
import { defaultElementStyle } from './palette';
import { addElement, bringForward, bringToFront, duplicateElements, groupElements, moveElement, moveElements, removeElement, resizeElement, rotateGroup, sendBackward, sendToBack, ungroupElements, updateElement } from './mutations';
import type { RabiscoElement } from '../types';

function novoTraco(): Omit<RabiscoElement, 'id'> {
  return {
    type: 'draw', x: 10, y: 10, w: 0, h: 0,
    points: [[0, 0], [5, 5]],
    text: '', labelColor: '#000',
    startBinding: null, endBinding: null, groupId: null,
    seed: 1, version: 1,
    ...defaultElementStyle('#1B1B1F'),
  };
}

describe('domain/rabisco/mutations', () => {
  it('addElement adiciona um elemento com id novo', () => {
    const d = addElement(blankRabisco('t'), novoTraco());
    expect(d.elements).toHaveLength(1);
    expect(d.elements[0].id).toBeTruthy();
    expect(d.elements[0].type).toBe('draw');
  });

  it('updateElement aplica mudanças e incrementa version', () => {
    let d = addElement(blankRabisco('t'), novoTraco());
    const id = d.elements[0].id;
    d = updateElement(d, id, { strokeColor: '#FF3B30' });
    expect(d.elements[0].strokeColor).toBe('#FF3B30');
    expect(d.elements[0].version).toBe(2);
  });

  it('updateElement é no-op se o elemento não existe', () => {
    const d = addElement(blankRabisco('t'), novoTraco());
    expect(updateElement(d, 'ghost', { strokeColor: '#000' })).toBe(d);
  });

  it('removeElement tira o elemento', () => {
    let d = addElement(blankRabisco('t'), novoTraco());
    const id = d.elements[0].id;
    d = removeElement(d, id);
    expect(d.elements).toHaveLength(0);
  });

  it('mutations nunca mutam o doc original', () => {
    const original = blankRabisco('t');
    addElement(original, novoTraco());
    expect(original.elements).toHaveLength(0);
  });

  it('removeElement também limpa bindings de setas que apontavam pra ele', () => {
    let d = addElement(blankRabisco('t'), novoTraco());
    const targetId = d.elements[0].id;
    d = addElement(d, { ...novoTraco(), type: 'arrow', endBinding: { id: targetId, fx: 0, fy: 0 } });
    d = removeElement(d, targetId);
    expect(d.elements).toHaveLength(1);
    expect(d.elements[0].endBinding).toBeNull();
  });

  it('moveElement soma dx/dy em x/y', () => {
    let d = addElement(blankRabisco('t'), novoTraco());
    const id = d.elements[0].id;
    d = moveElement(d, id, 5, -3);
    expect(d.elements[0].x).toBe(15);
    expect(d.elements[0].y).toBe(7);
  });

  it('moveElements move só os ids do grupo, os outros ficam parados', () => {
    let d = addElement(blankRabisco('t'), novoTraco());
    d = addElement(d, novoTraco());
    d = addElement(d, novoTraco());
    const [a, b, c] = d.elements.map((e) => e.id);
    d = moveElements(d, [a, c], 5, -3);
    expect(d.elements[0]).toMatchObject({ x: 15, y: 7 });
    expect(d.elements[1]).toMatchObject({ x: 10, y: 10 }); // b não fazia parte do grupo
    expect(d.elements[2]).toMatchObject({ x: 15, y: 7 });
  });

  it('moveElements com lista vazia é no-op', () => {
    const d = addElement(blankRabisco('t'), novoTraco());
    expect(moveElements(d, [], 5, 5)).toBe(d);
  });

  it('resizeElement seta a caixa (x/y/w/h) direto', () => {
    let d = addElement(blankRabisco('t'), novoTraco());
    const id = d.elements[0].id;
    d = resizeElement(d, id, { x: 0, y: 0, w: 40, h: 20 });
    expect(d.elements[0]).toMatchObject({ x: 0, y: 0, w: 40, h: 20 });
  });

  it('duplicateElements cria cópias deslocadas, sem bindings', () => {
    let d = addElement(blankRabisco('t'), { ...novoTraco(), startBinding: { id: 'x', fx: 0, fy: 0 } });
    const id = d.elements[0].id;
    d = duplicateElements(d, [id]);
    expect(d.elements).toHaveLength(2);
    expect(d.elements[1].id).not.toBe(id);
    expect(d.elements[1].x).toBe(d.elements[0].x + 16);
    expect(d.elements[1].startBinding).toBeNull();
  });

  it('duplicateElements com grupo dá um groupId novo às cópias, ligadas entre si mas não ao original', () => {
    let d = addElement(blankRabisco('t'), novoTraco());
    d = addElement(d, novoTraco());
    const [a, b] = d.elements.map((e) => e.id);
    d = groupElements(d, [a, b]);
    d = duplicateElements(d, [a, b]);
    expect(d.elements).toHaveLength(4);
    const [origA, origB, copyA, copyB] = d.elements;
    expect(origA.groupId).toBe(origB.groupId);
    expect(copyA.groupId).toBe(copyB.groupId);
    expect(copyA.groupId).not.toBe(origA.groupId);
    expect(copyA.groupId).not.toBeNull();
  });

  it('duplicateElements com lista vazia é no-op', () => {
    const d = addElement(blankRabisco('t'), novoTraco());
    expect(duplicateElements(d, [])).toBe(d);
  });

  it('groupElements dá o mesmo groupId a todo mundo, no-op com menos de 2 ids', () => {
    let d = addElement(blankRabisco('t'), novoTraco());
    d = addElement(d, novoTraco());
    const [a, b] = d.elements.map((e) => e.id);
    expect(groupElements(d, [a])).toBe(d);
    d = groupElements(d, [a, b]);
    expect(d.elements[0].groupId).not.toBeNull();
    expect(d.elements[0].groupId).toBe(d.elements[1].groupId);
  });

  it('ungroupElements limpa o groupId de quem estava junto', () => {
    let d = addElement(blankRabisco('t'), novoTraco());
    d = addElement(d, novoTraco());
    const [a, b] = d.elements.map((e) => e.id);
    d = groupElements(d, [a, b]);
    d = ungroupElements(d, [a, b]);
    expect(d.elements[0].groupId).toBeNull();
    expect(d.elements[1].groupId).toBeNull();
  });

  it('ungroupElements é no-op se ninguém dos ids tinha groupId', () => {
    const d = addElement(blankRabisco('t'), novoTraco());
    expect(ungroupElements(d, [d.elements[0].id])).toBe(d);
  });

  it('rotateGroup órbita a posição das formas e soma na própria rotação; linha/traço giram os pontos', () => {
    let d = addElement(blankRabisco('t'), { ...novoTraco(), type: 'rect', w: 10, h: 10, points: null, x: 10, y: -5 });
    d = addElement(d, novoTraco());
    const [rectId, drawId] = d.elements.map((e) => e.id);
    // 90° em volta da origem: o centro do retângulo (15,0) vai pra (0,15).
    d = rotateGroup(d, [rectId, drawId], { x: 0, y: 0 }, Math.PI / 2);
    const rect = d.elements.find((e) => e.id === rectId)!;
    expect(rect.x).toBeCloseTo(-5, 5);
    expect(rect.y).toBeCloseTo(10, 5);
    expect(rect.rotation).toBeCloseTo(Math.PI / 2, 5);
    const draw = d.elements.find((e) => e.id === drawId)!;
    // origem do traço (10,10) girada 90° em volta de (0,0) vira (-10,10).
    expect(draw.x).toBeCloseTo(-10, 5);
    expect(draw.y).toBeCloseTo(10, 5);
  });

  it('rotateGroup com delta zero é no-op', () => {
    const d = addElement(blankRabisco('t'), novoTraco());
    expect(rotateGroup(d, [d.elements[0].id], { x: 0, y: 0 }, 0)).toBe(d);
  });

  it('bringForward troca de posição com o vizinho de cima, e é no-op já no topo', () => {
    let d = addElement(blankRabisco('t'), novoTraco());
    d = addElement(d, novoTraco());
    d = addElement(d, novoTraco());
    const [a, b, c] = d.elements.map((e) => e.id);
    d = bringForward(d, a);
    expect(d.elements.map((e) => e.id)).toEqual([b, a, c]);
    d = bringForward(d, c);
    expect(d.elements.map((e) => e.id)).toEqual([b, a, c]);
  });

  it('sendBackward troca de posição com o vizinho de baixo, e é no-op já no fundo', () => {
    let d = addElement(blankRabisco('t'), novoTraco());
    d = addElement(d, novoTraco());
    d = addElement(d, novoTraco());
    const [a, b, c] = d.elements.map((e) => e.id);
    d = sendBackward(d, c);
    expect(d.elements.map((e) => e.id)).toEqual([a, c, b]);
    d = sendBackward(d, a);
    expect(d.elements.map((e) => e.id)).toEqual([a, c, b]);
  });

  it('bringToFront manda pro fim do array', () => {
    let d = addElement(blankRabisco('t'), novoTraco());
    d = addElement(d, novoTraco());
    d = addElement(d, novoTraco());
    const [a, b, c] = d.elements.map((e) => e.id);
    d = bringToFront(d, a);
    expect(d.elements.map((e) => e.id)).toEqual([b, c, a]);
  });

  it('sendToBack manda pro início do array', () => {
    let d = addElement(blankRabisco('t'), novoTraco());
    d = addElement(d, novoTraco());
    d = addElement(d, novoTraco());
    const [a, b, c] = d.elements.map((e) => e.id);
    d = sendToBack(d, c);
    expect(d.elements.map((e) => e.id)).toEqual([c, a, b]);
  });

  it('reorder é no-op se o elemento não existe', () => {
    const d = addElement(blankRabisco('t'), novoTraco());
    expect(bringForward(d, 'ghost')).toBe(d);
    expect(sendToBack(d, 'ghost')).toBe(d);
  });
});
