import { useContext } from 'react';
import { ThemeContext, type Theme } from './ThemeProvider';

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() precisa de um <ThemeProvider> por cima na árvore.');
  return ctx;
}
