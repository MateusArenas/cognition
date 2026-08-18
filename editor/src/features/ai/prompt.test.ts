import { describe, expect, it } from 'vitest';
import { buildPrompt, limparCerca } from './prompt';
import { templateFlow } from '@/domain/mermaid/templates';

describe('buildPrompt', () => {
  it('inclui o código atual e o pedido', () => {
    const p = buildPrompt(templateFlow(), 'adicione um nó de erro');
    expect(p).toContain('flowchart TD');
    expect(p).toContain('adicione um nó de erro');
  });

  it('com alvo, instrui a não tocar no resto', () => {
    const p = buildPrompt(templateFlow(), 'renomeie', { descricao: 'o nó A' });
    expect(p).toContain('Altere APENAS o nó A');
  });

  it('com erro anterior, pede correção', () => {
    const p = buildPrompt(templateFlow(), 'x', undefined, 'Parse error linha 3');
    expect(p).toContain('não compilou');
    expect(p).toContain('Parse error linha 3');
  });
});

describe('limparCerca', () => {
  it('tira a cerca de código quando a IA devolve com ```', () => {
    expect(limparCerca('```mermaid\nflowchart TD\nA-->B\n```')).toBe('flowchart TD\nA-->B');
  });

  it('deixa como está se não vier cercado', () => {
    expect(limparCerca('flowchart TD\nA-->B')).toBe('flowchart TD\nA-->B');
  });
});
