import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  DEFAULT_SETTINGS,
  api,
  type AppSettings,
  type ThemePreference,
} from "@/lib/tauri";
import { isWindows } from "@/lib/platform";

export type Theme = ThemePreference;

function mediaPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function setDarkClass(enabled: boolean) {
  document.documentElement.classList.toggle("dark", enabled);
}

/** OS dark mode — on Windows, bypass WebView2 PreferredColorScheme. */
async function osPrefersDark(): Promise<boolean> {
  if (isWindows()) {
    try {
      return await invoke<boolean>("system_prefers_dark");
    } catch {
      /* fall through */
    }
  }
  return mediaPrefersDark();
}

async function resolveDark(theme: ThemePreference): Promise<boolean> {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return osPrefersDark();
}

/**
 * Keep native title bar + WebView color scheme in sync with the resolved UI.
 *
 * On Windows, `setTheme` also drives WebView2 PreferredColorScheme. Leaving it
 * stuck on Light (e.g. from an old config default) poisons `matchMedia` and
 * makes system / dark switching look broken — so we always push an explicit
 * light/dark that matches the resolved UI (including when preference is system).
 */
async function syncWindowChromeTheme(resolvedDark: boolean) {
  const windowTheme = resolvedDark ? "dark" : "light";

  try {
    await getCurrentWindow().setTheme(windowTheme);
  } catch {
    /* best-effort; unavailable outside Tauri / without permission */
  }

  try {
    await invoke("sync_window_chrome", { dark: resolvedDark });
  } catch {
    /* no-op on non-Windows / older builds */
  }
}

let applySeq = 0;

export function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  const seq = ++applySeq;

  if (theme === "system") {
    delete root.dataset.theme;
    // Optimistic paint from media; corrected below via OS API on Windows.
    setDarkClass(mediaPrefersDark());
  } else {
    root.dataset.theme = theme;
    setDarkClass(theme === "dark");
  }

  void (async () => {
    const resolvedDark = await resolveDark(theme);
    if (seq !== applySeq) return;
    // Still on the same preference (system has no dataset.theme).
    if (theme === "system" && root.dataset.theme) return;
    if (theme !== "system" && root.dataset.theme !== theme) return;

    setDarkClass(resolvedDark);
    await syncWindowChromeTheme(resolvedDark);
  })();
}

let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;
let unlistenWindowTheme: (() => void) | null = null;
let unlistenOsTheme: (() => void) | null = null;
let systemVisibilityListener: (() => void) | null = null;
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
  if (unlistenOsTheme) {
    unlistenOsTheme();
    unlistenOsTheme = null;
  }
  if (systemVisibilityListener) {
    document.removeEventListener("visibilitychange", systemVisibilityListener);
    systemVisibilityListener = null;
  }
}

export function syncSystemThemeListener(theme: ThemePreference) {
  clearSystemThemeWatchers();
  if (theme !== "system") return;

  const seq = themeWatchSeq;
  const reapply = () => applyTheme("system");

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  systemThemeListener = () => reapply();
  media.addEventListener("change", systemThemeListener);

  systemVisibilityListener = () => {
    if (document.hidden) return;
    if (document.documentElement.dataset.theme) return;
    reapply();
  };
  document.addEventListener("visibilitychange", systemVisibilityListener);

  // When window theme follows OS (or setTheme works), Tauri emits this.
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

  // Windows: WebView2 PreferredColorScheme can desync from the OS.
  // The backend watches AppsUseLightTheme (no timer) and emits this.
  if (isWindows()) {
    void listen<boolean>("os-theme-changed", () => {
      if (document.documentElement.dataset.theme) return;
      reapply();
    })
      .then((unlisten) => {
        if (seq !== themeWatchSeq || document.documentElement.dataset.theme) {
          unlisten();
          return;
        }
        unlistenOsTheme = unlisten;
      })
      .catch(() => {
        /* outside Tauri */
      });
  }
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    return await api.getSettings();
  } catch {
    return DEFAULT_SETTINGS;
  }
}
