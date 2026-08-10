import { create } from "zustand";
import {
  api,
  DEFAULT_SETTINGS,
  type AppSettings,
  type ThemePreference,
} from "@/lib/tauri";

export type Theme = ThemePreference;

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function setDarkClass(enabled: boolean) {
  document.documentElement.classList.toggle("dark", enabled);
}

export function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
    setDarkClass(systemPrefersDark());
  } else {
    root.dataset.theme = theme;
    setDarkClass(theme === "dark");
  }
}

let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;

function syncSystemThemeListener(theme: ThemePreference) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  if (systemThemeListener) {
    media.removeEventListener("change", systemThemeListener);
    systemThemeListener = null;
  }
  if (theme !== "system") return;
  systemThemeListener = () => applyTheme("system");
  media.addEventListener("change", systemThemeListener);
}

export type SettingsState = {
  settings: AppSettings;
  ready: boolean;
  init: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  ready: false,

  init: async () => {
    try {
      const loaded = await api.getSettings();
      set({ settings: loaded, ready: true });
      applyTheme(loaded.theme);
      syncSystemThemeListener(loaded.theme);
    } catch {
      set({ settings: DEFAULT_SETTINGS, ready: true });
      applyTheme(DEFAULT_SETTINGS.theme);
      syncSystemThemeListener(DEFAULT_SETTINGS.theme);
    }
  },

  updateSettings: async (patch) => {
    const prev = get().settings;
    const next = { ...prev, ...patch };
    const themeChanged = next.theme !== prev.theme;
    set({ settings: next });
    if (themeChanged) {
      applyTheme(next.theme);
      syncSystemThemeListener(next.theme);
    }
    try {
      const saved = await api.updateSettings(next);
      const same =
        saved.scanDepth === next.scanDepth &&
        saved.concurrency === next.concurrency &&
        saved.theme === next.theme;
      if (!same) {
        set({ settings: saved });
        if (saved.theme !== next.theme) {
          applyTheme(saved.theme);
          syncSystemThemeListener(saved.theme);
        }
      }
    } catch {
      try {
        const reloaded = await api.getSettings();
        set({ settings: reloaded });
        applyTheme(reloaded.theme);
        syncSystemThemeListener(reloaded.theme);
      } catch {
        // keep optimistic value
      }
    }
  },
}));

export function useSettings(): Pick<
  SettingsState,
  "settings" | "ready" | "updateSettings"
> {
  const settings = useSettingsStore((s) => s.settings);
  const ready = useSettingsStore((s) => s.ready);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  return { settings, ready, updateSettings };
}

export function useThemeSetting() {
  const theme = useSettingsStore((s) => s.settings.theme);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  return { theme, updateSettings };
}
