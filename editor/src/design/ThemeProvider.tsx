import { createContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { easing, palette, radius, space, type, type Palette, type Scheme } from './tokens';

export type ThemeMode = 'auto' | 'light' | 'dark';

export interface Theme {
  scheme: Scheme;
  mode: ThemeMode;
  colors: Palette;
  type: typeof type;
  space: typeof space;
  radius: typeof radius;
  easing: typeof easing;
  setMode: (mode: ThemeMode) => void;
}

export const ThemeContext = createContext<Theme | null>(null);

interface Props {
  children: ReactNode;
  /** Só para testes/storybook — em produção o modo vem de useSettings (Etapa 16). */
  initialMode?: ThemeMode;
}

// O app segue o tema do sistema (`mode: 'auto'`) até o usuário escolher um, e aí passa a
// respeitar a escolha — é como o iOS se comporta. A persistência da escolha do usuário chega
// com store/useSettings.ts (Etapa 16); por enquanto o estado só vive nesta sessão.
export function ThemeProvider({ children, initialMode = 'auto' }: Props) {
  const system = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  const scheme: Scheme = mode === 'auto' ? (system === 'dark' ? 'dark' : 'light') : mode;

  const value = useMemo<Theme>(
    () => ({ scheme, mode, colors: palette[scheme], type, space, radius, easing, setMode }),
    [scheme, mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
