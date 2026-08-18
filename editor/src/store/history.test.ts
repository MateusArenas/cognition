import { describe, expect, it } from 'vitest';
import { emptyHistory, pushSnapshot, redoStep, undoStep } from './history';

describe('history — undo/redo', () => {
  it('undo volta pro snapshot anterior e guarda o atual em future', () => {
    const h = pushSnapshot(emptyHistory, 'v1');
    const step = undoStep(h, 'v2');
    expect(step).not.toBeNull();
    expect(step!.snapshot).toBe('v1');
    expect(step!.history.future).toEqual(['v2']);
    expect(step!.history.past).toEqual([]);
  });

  it('redo avança pro snapshot seguinte e devolve o atual pra past', () => {
    const h = { past: ['v1'], future: ['v2'] };
    const step = redoStep(h, 'v1.5');
    expect(step!.snapshot).toBe('v2');
    expect(step!.history.past).toEqual(['v1', 'v1.5']);
    expect(step!.history.future).toEqual([]);
  });

  it('undo em histórico vazio devolve null — digitar não empilha nada pra desfazer', () => {
    expect(undoStep(emptyHistory, 'v1')).toBeNull();
  });

  it('redo sem future devolve null', () => {
    expect(redoStep(emptyHistory, 'v1')).toBeNull();
  });

  it('pushSnapshot limpa future — uma edição nova invalida o redo', () => {
    const h = pushSnapshot({ past: ['v1'], future: ['v2'] }, 'v1.5');
    expect(h.future).toEqual([]);
    expect(h.past).toEqual(['v1', 'v1.5']);
  });

  it('limita a 80 snapshots', () => {
    let h = emptyHistory;
    for (let i = 0; i < 90; i++) h = pushSnapshot(h, 'v' + i);
    expect(h.past).toHaveLength(80);
    expect(h.past[0]).toBe('v10');
  });
});
