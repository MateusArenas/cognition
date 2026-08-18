import { describe, expect, it } from 'vitest';
import { countDiagrams, countWords, findMermaidBlocks, insertMermaidBlock, replaceBlock } from './blocks';

describe('findMermaidBlocks', () => {
  it('acha os blocos e os offsets batem com o texto', () => {
    const md = '# t\n\n```mermaid\nflowchart TD\nA-->B\n```\n\ntexto\n\n```mermaid\nerDiagram\n```\n';
    const blocos = findMermaidBlocks(md);
    expect(blocos).toHaveLength(2);
    blocos.forEach((b) => expect(md.slice(b.ini, b.fim)).toBe(b.corpo));
  });
});

describe('replaceBlock — a ida e volta documento↔diagrama (§13.4)', () => {
  it('substitui exatamente o intervalo do bloco, o resto sai idêntico', () => {
    const md = 'antes\n\n```mermaid\nflowchart TD\nA-->B\n```\n\ndepois';
    const [bloco] = findMermaidBlocks(md);
    const novo = replaceBlock(md, bloco, 'flowchart TD\nA-->B-->C');
    expect(novo).toBe('antes\n\n```mermaid\nflowchart TD\nA-->B-->C\n```\n\ndepois');
  });
});

describe('insertMermaidBlock', () => {
  it('insere um bloco válido, que o próprio findMermaidBlocks reconhece depois', () => {
    const md = '# título\n\ntexto';
    const at = md.length;
    const novo = insertMermaidBlock(md, at, 'flowchart TD\nA-->B');
    const blocos = findMermaidBlocks(novo);
    expect(blocos).toHaveLength(1);
    expect(blocos[0].corpo).toBe('flowchart TD\nA-->B');
  });
});

describe('contadores da linha de estado', () => {
  it('conta palavras e diagramas', () => {
    const md = 'uma frase com cinco palavras\n\n```mermaid\nflowchart TD\n```\n';
    expect(countWords('uma frase com cinco palavras')).toBe(5);
    expect(countDiagrams(md)).toBe(1);
  });
});
