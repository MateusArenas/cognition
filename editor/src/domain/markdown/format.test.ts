import { describe, expect, it } from 'vitest';
import { cycleHeading, insertLink, toggleLinePrefix, toggleTask, toggleWrap } from './format';

describe('toggleWrap — idempotente', () => {
  it('negrito aplicado duas vezes na mesma seleção volta ao texto original', () => {
    const text = 'oi mundo';
    const r1 = toggleWrap(text, 3, 8, '**'); // "mundo"
    expect(r1.text).toBe('oi **mundo**');
    const r2 = toggleWrap(r1.text, r1.selStart, r1.selEnd, '**');
    expect(r2.text).toBe(text);
    expect([r2.selStart, r2.selEnd]).toEqual([3, 8]);
  });

  it('funciona igual para itálico e código', () => {
    const r1 = toggleWrap('abc', 0, 3, '*');
    const r2 = toggleWrap(r1.text, r1.selStart, r1.selEnd, '*');
    expect(r2.text).toBe('abc');
  });
});

describe('toggleLinePrefix — idempotente', () => {
  it('lista aplicada duas vezes volta ao original', () => {
    const text = 'um\ndois';
    const r1 = toggleLinePrefix(text, 0, text.length, '- ');
    expect(r1.text).toBe('- um\n- dois');
    const r2 = toggleLinePrefix(r1.text, r1.selStart, r1.selEnd, '- ');
    expect(r2.text).toBe(text);
  });

  it('citação em uma linha só', () => {
    const r1 = toggleLinePrefix('nota', 0, 4, '> ');
    expect(r1.text).toBe('> nota');
    const r2 = toggleLinePrefix(r1.text, r1.selStart, r1.selEnd, '> ');
    expect(r2.text).toBe('nota');
  });
});

describe('toggleTask — idempotente', () => {
  it('cria e remove a caixa de tarefa', () => {
    const r1 = toggleTask('comprar pão', 0, 11);
    expect(r1.text).toBe('- [ ] comprar pão');
    const r2 = toggleTask(r1.text, r1.selStart, r1.selEnd);
    expect(r2.text).toBe('comprar pão');
  });

  it('remove mesmo se a tarefa já estiver marcada como feita', () => {
    const r = toggleTask('- [x] feito', 6, 11);
    expect(r.text).toBe('feito');
  });
});

describe('cycleHeading', () => {
  it('cicla # -> ## -> ### -> #### -> nenhum', () => {
    let text = 'título';
    let cursor = 0;
    for (const esperado of ['# título', '## título', '### título', '#### título', 'título']) {
      const r = cycleHeading(text, cursor);
      expect(r.text).toBe(esperado);
      text = r.text;
      cursor = r.selStart;
    }
  });
});

describe('insertLink', () => {
  it('envolve a seleção como [texto](url), com "url" pronto pra trocar', () => {
    const r = insertLink('veja aqui', 5, 9); // "aqui"
    expect(r.text).toBe('veja [aqui](url)');
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('url');
  });
});
