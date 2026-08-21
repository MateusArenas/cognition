// Paletas do terminal — portadas do protótipo (ssh_mobile_prototipo.html, objeto THEMES), no
// formato ITheme que o xterm.js espera (background/foreground/cursor + 16 cores ANSI). O
// protótipo só definia 9 variáveis (bg/fg/dim/g/c/y/r/b/m); as variantes "bright" reaproveitam a
// mesma cor da normal — simplificação consciente, o objetivo é a MESMA sensação visual de cada
// tema, não replicar 16 tons calibrados à mão.
export interface TerminalTheme {
  id: string;
  nameKey: string;
  colors: Record<string, string>;
}

function build(bg: string, fg: string, dim: string, g: string, c: string, y: string, r: string, b: string, m: string): Record<string, string> {
  return {
    background: bg,
    foreground: fg,
    cursor: g,
    cursorAccent: bg,
    selectionBackground: '#3A6FD644',
    black: dim,
    red: r,
    green: g,
    yellow: y,
    blue: b,
    magenta: m,
    cyan: c,
    white: fg,
    brightBlack: dim,
    brightRed: r,
    brightGreen: g,
    brightYellow: y,
    brightBlue: b,
    brightMagenta: m,
    brightCyan: c,
    brightWhite: '#FFFFFF',
  };
}

export const TERMINAL_THEMES: TerminalTheme[] = [
  { id: 'nordeste-escuro', nameKey: 'ssh.themes.nordesteEscuro', colors: build('#0A0E14', '#D6DEEB', '#5F7E97', '#5DE4A1', '#5CCFE6', '#FFCB6B', '#FF6E6E', '#82AAFF', '#C792EA') },
  { id: 'dracula', nameKey: 'ssh.themes.dracula', colors: build('#282A36', '#F8F8F2', '#6272A4', '#50FA7B', '#8BE9FD', '#F1FA8C', '#FF5555', '#BD93F9', '#FF79C6') },
  { id: 'solarizado-escuro', nameKey: 'ssh.themes.solarizadoEscuro', colors: build('#002B36', '#93A1A1', '#586E75', '#859900', '#2AA198', '#B58900', '#DC322F', '#268BD2', '#D33682') },
  { id: 'one-dark', nameKey: 'ssh.themes.oneDark', colors: build('#282C34', '#ABB2BF', '#5C6370', '#98C379', '#56B6C2', '#E5C07B', '#E06C75', '#61AFEF', '#C678DD') },
  { id: 'padrao-sistema', nameKey: 'ssh.themes.padraoSistema', colors: build('#000000', '#E6E6E6', '#7A7A7E', '#30D158', '#40C8E0', '#FF9F0A', '#FF453A', '#0A84FF', '#BF5AF2') },
];

export function terminalThemeById(id: string): TerminalTheme {
  return TERMINAL_THEMES.find((t) => t.id === id) ?? TERMINAL_THEMES[0];
}
