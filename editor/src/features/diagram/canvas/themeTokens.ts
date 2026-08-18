import type { Palette } from '@/design/tokens';

// Tokens de cor que o runtime.shell.html espera na mensagem `render` — não deixar o Mermaid
// derivar sozinho o tema, ou as faixas de atributo do ER saem erradas num dos dois temas
// (docs/06-canvas.md §8.3).
export function toRuntimeTokens(colors: Palette): Record<string, string> {
  return {
    bg: colors.bg,
    surface: colors.surface,
    surface2: colors.surface2,
    surface3: colors.surface3,
    separator: colors.separator,
    separatorBold: colors.separatorBold,
    label: colors.label,
    labelSecondary: colors.labelSecondary,
    labelTertiary: colors.labelTertiary,
    blue: colors.blue,
    red: colors.red,
    green: colors.green,
    orange: colors.orange,
    indigo: colors.indigo,
  };
}
