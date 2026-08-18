import { describe, expect, it } from 'vitest';
import { TIPOS, detectarTipo, tipoById } from './catalog';

describe('catálogo dos 25 tipos', () => {
  it('tem exatamente 25 tipos', () => {
    expect(TIPOS).toHaveLength(25);
  });

  it('cada id é único', () => {
    const ids = TIPOS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todo template começa pela própria keyword', () => {
    TIPOS.filter((t) => t.code).forEach((t) => {
      const primeiraLinha = t.code!.trim().split('\n')[0].trim();
      expect(primeiraLinha.toLowerCase().startsWith(t.kw.toLowerCase())).toBe(true);
    });
  });

  it('não lista ZenUML nem Wardley (dependem de plugin fora da lib padrão)', () => {
    const kws = TIPOS.map((t) => t.kw.toLowerCase());
    expect(kws).not.toContain('zenuml');
    expect(kws.some((k) => k.includes('wardley'))).toBe(false);
  });

  it('tipoById encontra flow e er, que têm modelo visual', () => {
    expect(tipoById('flow')?.visual).toBe(true);
    expect(tipoById('er')?.visual).toBe(true);
  });

  it('detectarTipo reconhece a keyword da primeira linha', () => {
    expect(detectarTipo('sequenceDiagram')).toBe('Sequência');
    expect(detectarTipo('gantt')).toBe('Gantt');
    expect(detectarTipo('coisaNuncaVista')).toBe('coisaNuncaVista');
  });
});
