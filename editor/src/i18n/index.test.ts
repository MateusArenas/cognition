import { describe, expect, it } from 'vitest';
import ptBR from './pt-BR.json';
import en from './en.json';
import es from './es.json';
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

  // Antes só existia checagem pontual (algumas chaves, à mão) — nada garantia que uma chave
  // nova (ex.: o namespace `auth` inteiro, Etapa de autenticação) entrasse nos TRÊS catálogos
  // no mesmo commit, regra do CLAUDE.md. Isto varre a árvore inteira e compara os conjuntos de
  // chaves — falha se qualquer catálogo tiver uma chave que os outros dois não têm.
  it('os três catálogos têm exatamente o mesmo conjunto de chaves', () => {
    function collectKeys(obj: unknown, prefix = ''): string[] {
      if (typeof obj !== 'object' || obj === null) return [prefix];
      return Object.entries(obj).flatMap(([k, v]) => collectKeys(v, prefix ? `${prefix}.${k}` : k));
    }

    const ptKeys = new Set(collectKeys(ptBR));
    const enKeys = new Set(collectKeys(en));
    const esKeys = new Set(collectKeys(es));

    const missingInEn = [...ptKeys].filter((k) => !enKeys.has(k));
    const missingInEs = [...ptKeys].filter((k) => !esKeys.has(k));
    const extraInEn = [...enKeys].filter((k) => !ptKeys.has(k));
    const extraInEs = [...esKeys].filter((k) => !ptKeys.has(k));

    expect(missingInEn, `en.json está faltando: ${missingInEn.join(', ')}`).toEqual([]);
    expect(missingInEs, `es.json está faltando: ${missingInEs.join(', ')}`).toEqual([]);
    expect(extraInEn, `en.json tem chaves a mais que pt-BR.json: ${extraInEn.join(', ')}`).toEqual([]);
    expect(extraInEs, `es.json tem chaves a mais que pt-BR.json: ${extraInEs.join(', ')}`).toEqual([]);
  });
});
