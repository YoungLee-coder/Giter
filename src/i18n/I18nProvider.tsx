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
  detectLocale,
  STORAGE_KEY,
  translate,
  translateBackendMessage,
  translateStage,
  type Locale,
  type MessageKey,
  type TranslateParams,
} from "./core";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: TranslateParams) => string;
  tStage: (stage: string) => string;
  tMessage: (message: string | null | undefined) => string | null;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale());

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "zh-CN" ? "zh-CN" : "en";
  }, [locale]);

  const t = useCallback(
    (key: MessageKey, params?: TranslateParams) => translate(locale, key, params),
    [locale],
  );

  const tStage = useCallback(
    (stage: string) => translateStage(locale, stage),
    [locale],
  );

  const tMessage = useCallback(
    (message: string | null | undefined) => translateBackendMessage(locale, message),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, tStage, tMessage }),
    [locale, setLocale, t, tStage, tMessage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
