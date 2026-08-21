import { describe, expect, it } from 'vitest';
import { terminalThemeById, TERMINAL_THEMES } from './themes';

const REQUIRED_KEYS = [
  'background', 'foreground', 'cursor', 'cursorAccent', 'selectionBackground',
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
];

describe('TERMINAL_THEMES', () => {
  it('cada tema tem as 21 chaves que o ITheme do xterm.js espera', () => {
    for (const theme of TERMINAL_THEMES) {
      for (const key of REQUIRED_KEYS) expect(theme.colors, `${theme.id}.${key}`).toHaveProperty(key);
    }
  });

  it('todas as cores são hex válido de 6 dígitos', () => {
    for (const theme of TERMINAL_THEMES) {
      for (const [key, value] of Object.entries(theme.colors)) {
        expect(value, `${theme.id}.${key}`).toMatch(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/);
      }
    }
  });

  it('ids são únicos', () => {
    const ids = TERMINAL_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('terminalThemeById', () => {
  it('acha o tema pelo id', () => {
    expect(terminalThemeById('dracula').id).toBe('dracula');
  });

  it('cai pro primeiro tema (default) quando o id não existe', () => {
    expect(terminalThemeById('inexistente').id).toBe(TERMINAL_THEMES[0].id);
  });
});
