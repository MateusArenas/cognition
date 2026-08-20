import { getLocales } from 'expo-localization';
import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import { normalizeLanguage, type AppLanguage } from '@/i18n';
import type { ThemeMode } from '@/design/ThemeProvider';

const SETTINGS_KEY = 'editor.settings.v1';

interface PersistedSettings {
  language: AppLanguage;
  themeMode: ThemeMode;
  // Cliente de banco de dados (features/dbclient) — endereço do backend NestJS e o token de
  // sessão, pra sobreviver fechar/reabrir o app sem logar de novo. Mesmo padrão de
  // idioma/tema: guardado junto no mesmo registro, reaproveitando o Storage já existente em
  // vez de trazer AsyncStorage como dependência nova (docs/17-db-client.md).
  dbApiBaseUrl: string;
  dbAuthToken: string | null;
}

interface SettingsState extends PersistedSettings {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setLanguage: (language: AppLanguage) => void;
  setThemeMode: (themeMode: ThemeMode) => void;
  setDbApiBaseUrl: (url: string) => void;
  setDbAuthToken: (token: string | null) => void;
}

const DEFAULT_DB_API_BASE_URL = 'http://localhost:3333/api/v1';

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
  dbApiBaseUrl: DEFAULT_DB_API_BASE_URL,
  dbAuthToken: null,
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
          dbApiBaseUrl: saved.dbApiBaseUrl || DEFAULT_DB_API_BASE_URL,
          dbAuthToken: saved.dbAuthToken ?? null,
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
    persist({ language, themeMode: get().themeMode, dbApiBaseUrl: get().dbApiBaseUrl, dbAuthToken: get().dbAuthToken });
  },
  setThemeMode: (themeMode) => {
    set({ themeMode });
    persist({ language: get().language, themeMode, dbApiBaseUrl: get().dbApiBaseUrl, dbAuthToken: get().dbAuthToken });
  },
  setDbApiBaseUrl: (dbApiBaseUrl) => {
    set({ dbApiBaseUrl });
    persist({ language: get().language, themeMode: get().themeMode, dbApiBaseUrl, dbAuthToken: get().dbAuthToken });
  },
  setDbAuthToken: (dbAuthToken) => {
    set({ dbAuthToken });
    persist({ language: get().language, themeMode: get().themeMode, dbApiBaseUrl: get().dbApiBaseUrl, dbAuthToken });
  },
}));
