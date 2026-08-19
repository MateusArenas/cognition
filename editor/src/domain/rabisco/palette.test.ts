import { describe, expect, it } from 'vitest';
import { newElement } from './palette';

describe('domain/rabisco/palette', () => {
  it('newElement de forma nasce com w=h=0 e sem points', () => {
    const el = newElement('rect', 10, 20, '#fff');
    expect(el.x).toBe(10);
    expect(el.y).toBe(20);
    expect(el.w).toBe(0);
    expect(el.h).toBe(0);
    expect(el.points).toBeNull();
  });

  it('newElement de traço nasce com um ponto na origem', () => {
    const el = newElement('draw', 0, 0, '#fff');
    expect(el.points).toEqual([[0, 0]]);
  });

  it('newElement de linha/seta nasce com dois pontos coincidentes', () => {
    expect(newElement('line', 0, 0, '#fff').points).toEqual([[0, 0], [0, 0]]);
    expect(newElement('arrow', 0, 0, '#fff').points).toEqual([[0, 0], [0, 0]]);
  });

  it('newElement usa a cor de traço dada, inclusive como labelColor', () => {
    const el = newElement('rect', 0, 0, '#FF3B30');
    expect(el.strokeColor).toBe('#FF3B30');
    expect(el.labelColor).toBe('#FF3B30');
  });
});
