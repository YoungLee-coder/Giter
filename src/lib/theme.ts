import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_SETTINGS,
  api,
  type AppSettings,
  type ThemePreference,
} from "@/lib/tauri";

export type Theme = ThemePreference;

function mediaPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function setDarkClass(enabled: boolean) {
  document.documentElement.classList.toggle("dark", enabled);
}

function resolvedDark(theme: ThemePreference): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return mediaPrefersDark();
}

function paintResolved(theme: ThemePreference) {
  const dark = resolvedDark(theme);
  setDarkClass(dark);
  void invoke("sync_window_chrome", { dark }).catch(() => {
    /* no-op on non-Windows / older builds */
  });
}

let applySeq = 0;

/**
 * Apply the user's theme preference.
 *
 * `system` must call `setTheme(null)` so WebView2 PreferredColorScheme stays
 * Auto. Forcing light/dark here poisons `matchMedia` and breaks OS follow.
 */
export function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  const seq = ++applySeq;

  if (theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
  setDarkClass(resolvedDark(theme));

  void (async () => {
    try {
      await getCurrentWindow().setTheme(theme === "system" ? null : theme);
    } catch {
      /* best-effort; unavailable outside Tauri / without permission */
    }
    if (seq !== applySeq) return;
    if (theme === "system" && root.dataset.theme) return;
    if (theme !== "system" && root.dataset.theme !== theme) return;
    paintResolved(theme);
  })();
}

let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;
let unlistenWindowTheme: (() => void) | null = null;
let themeWatchSeq = 0;

function clearSystemThemeWatchers() {
  themeWatchSeq += 1;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  if (systemThemeListener) {
    media.removeEventListener("change", systemThemeListener);
    systemThemeListener = null;
  }
  if (unlistenWindowTheme) {
    unlistenWindowTheme();
    unlistenWindowTheme = null;
  }
}

export function syncSystemThemeListener(theme: ThemePreference) {
  clearSystemThemeWatchers();
  if (theme !== "system") return;

  const seq = themeWatchSeq;
  const reapply = () => {
    if (document.documentElement.dataset.theme) return;
    paintResolved("system");
  };

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  systemThemeListener = () => reapply();
  media.addEventListener("change", systemThemeListener);

  void getCurrentWindow()
    .onThemeChanged(() => {
      reapply();
    })
    .then((unlisten) => {
      if (seq !== themeWatchSeq || document.documentElement.dataset.theme) {
        unlisten();
        return;
      }
      unlistenWindowTheme = unlisten;
    })
    .catch(() => {
      /* outside Tauri */
    });
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    return await api.getSettings();
  } catch {
    return DEFAULT_SETTINGS;
  }
}
