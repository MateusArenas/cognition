import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';

const SETTINGS_KEY = 'editor.ssh.settings.v1';

// Tema/fonte do terminal — preferência LOCAL do aparelho, não sincronizada pelo backend nesta
// v1 (evita criar uma tabela de settings só pra isso agora, ver docs/20-ssh-mobile.md#roadmap).
// Mesmo padrão de hydrate/persist de store/useSettings.ts.
interface PersistedSshSettings {
  themeId: string;
  fontSize: number;
}

interface SshSettingsState extends PersistedSshSettings {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setThemeId: (themeId: string) => void;
  setFontSize: (fontSize: number) => void;
}

function persist(settings: PersistedSshSettings) {
  void Storage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {
    // Preferência de tema/fonte não pode impedir o terminal de abrir.
  });
}

export const useSshSettings = create<SshSettingsState>((set, get) => ({
  themeId: 'nordeste-escuro',
  fontSize: 13,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await Storage.getItem(SETTINGS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistedSshSettings>;
        set({
          themeId: saved.themeId ?? 'nordeste-escuro',
          fontSize: typeof saved.fontSize === 'number' ? saved.fontSize : 13,
          hydrated: true,
        });
        return;
      }
    } catch {
      // Mantém os valores padrão.
    }
    set({ hydrated: true });
  },
  setThemeId: (themeId) => {
    set({ themeId });
    persist({ themeId, fontSize: get().fontSize });
  },
  setFontSize: (fontSize) => {
    set({ fontSize });
    persist({ themeId: get().themeId, fontSize });
  },
}));
