import { getLocales } from 'expo-localization';
import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import { normalizeLanguage, type AppLanguage } from '@/i18n';
import type { ThemeMode } from '@/design/ThemeProvider';

const SETTINGS_KEY = 'editor.settings.v1';

interface PersistedSettings {
  language: AppLanguage;
  themeMode: ThemeMode;
}

interface SettingsState extends PersistedSettings {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setLanguage: (language: AppLanguage) => void;
  setThemeMode: (themeMode: ThemeMode) => void;
}

function deviceLanguage(): AppLanguage {
  return normalizeLanguage(getLocales()[0]?.languageCode);
}

function persist(settings: PersistedSettings) {
  void Storage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {
    // Preferências não podem impedir o editor de abrir caso o armazenamento esteja indisponível.
  });
}

export const useSettings = create<SettingsState>((set, get) => ({
  language: deviceLanguage(),
  themeMode: 'auto',
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await Storage.getItem(SETTINGS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistedSettings>;
        set({
          language: normalizeLanguage(saved.language),
          themeMode: saved.themeMode === 'light' || saved.themeMode === 'dark' ? saved.themeMode : 'auto',
          hydrated: true,
        });
        return;
      }
    } catch {
      // Mantém os valores padrão (idioma do aparelho e tema automático).
    }
    set({ hydrated: true });
  },
  setLanguage: (language) => {
    set({ language });
    persist({ language, themeMode: get().themeMode });
  },
  setThemeMode: (themeMode) => {
    set({ themeMode });
    persist({ language: get().language, themeMode });
  },
}));
