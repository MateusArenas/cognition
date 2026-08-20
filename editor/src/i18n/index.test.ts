import { describe, expect, it } from 'vitest';
import { normalizeLanguage, translate } from './index';

describe('i18n', () => {
  it('normaliza o idioma do aparelho para os três idiomas suportados', () => {
    expect(normalizeLanguage('pt')).toBe('pt-BR');
    expect(normalizeLanguage('en-US')).toBe('en');
    expect(normalizeLanguage('es-419')).toBe('es');
    expect(normalizeLanguage('fr-FR')).toBe('pt-BR');
  });

  it('traduz a mesma chave em cada idioma', () => {
    expect(translate('pt-BR', 'settings.language')).toBe('Idioma');
    expect(translate('en', 'settings.language')).toBe('Language');
    expect(translate('es', 'settings.language')).toBe('Idioma');
  });
});
