import {
  DEFAULT_SETTINGS,
  api,
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

export function syncSystemThemeListener(theme: ThemePreference) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  if (systemThemeListener) {
    media.removeEventListener("change", systemThemeListener);
    systemThemeListener = null;
  }
  if (theme !== "system") return;
  systemThemeListener = () => applyTheme("system");
  media.addEventListener("change", systemThemeListener);
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    return await api.getSettings();
  } catch {
    return DEFAULT_SETTINGS;
  }
}
