import { I18n } from 'i18n-js';
import ptBR from './pt-BR.json';
import en from './en.json';
import es from './es.json';

export const SUPPORTED_LANGUAGES = ['pt-BR', 'en', 'es'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const i18n = new I18n({ 'pt-BR': ptBR, en, es });
i18n.enableFallback = true;
i18n.defaultLocale = 'pt-BR';

export function normalizeLanguage(languageCode: string | null | undefined): AppLanguage {
  if (languageCode?.toLowerCase().startsWith('en')) return 'en';
  if (languageCode?.toLowerCase().startsWith('es')) return 'es';
  return 'pt-BR';
}

export function translate(language: AppLanguage, key: string, options?: Record<string, unknown>): string {
  i18n.locale = language;
  return i18n.t(key, options) as string;
}
