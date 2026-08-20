import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSettings } from '@/store/useSettings';
import { translate, type AppLanguage } from './index';

interface I18nContextValue {
  language: AppLanguage;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const language = useSettings((state) => state.language);
  const value = useMemo<I18nContextValue>(
    () => ({ language, t: (key, options) => translate(language, key, options) }),
    [language]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n deve ser usado dentro de I18nProvider');
  return value;
}
