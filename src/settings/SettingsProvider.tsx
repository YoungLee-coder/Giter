import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  DEFAULT_SETTINGS,
  type AppSettings,
  type ThemePreference,
} from "../lib/tauri";

export type Theme = ThemePreference;

type SettingsContextValue = {
  settings: AppSettings;
  ready: boolean;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await api.getSettings();
        if (cancelled) return;
        setSettings(loaded);
        applyTheme(loaded.theme);
      } catch {
        if (cancelled) return;
        setSettings(DEFAULT_SETTINGS);
        applyTheme(DEFAULT_SETTINGS.theme);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    let next: AppSettings = DEFAULT_SETTINGS;
    setSettings((prev) => {
      next = { ...prev, ...patch };
      return next;
    });
    try {
      const saved = await api.updateSettings(next);
      setSettings(saved);
    } catch {
      try {
        const reloaded = await api.getSettings();
        setSettings(reloaded);
      } catch {
        // keep optimistic value
      }
    }
  }, []);

  const value = useMemo(
    () => ({ settings, ready, updateSettings }),
    [settings, ready, updateSettings],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return ctx;
}
