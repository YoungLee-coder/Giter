import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n, { isLocale, STORAGE_KEY, type Locale } from "@/i18n";
import { translateBackendMessage, translateStage } from "@/i18n/messages";

export function useI18n() {
  const { t, i18n: i18nInstance } = useTranslation();
  const locale = (
    isLocale(i18nInstance.language) ? i18nInstance.language : "en"
  ) as Locale;

  const setLocale = useCallback((next: Locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    void i18n.changeLanguage(next);
  }, []);

  const tStage = useCallback((stage: string) => translateStage(stage), []);
  const tMessage = useCallback(
    (message: string | null | undefined) => translateBackendMessage(message),
    [],
  );

  return { locale, setLocale, t, tStage, tMessage };
}

export type { Locale };
