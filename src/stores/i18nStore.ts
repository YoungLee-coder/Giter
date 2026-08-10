import { create } from "zustand";
import {
  detectLocale,
  STORAGE_KEY,
  translate,
  translateBackendMessage,
  translateStage,
  type Locale,
  type MessageKey,
  type TranslateParams,
} from "@/i18n/core";

function applyDocumentLang(locale: Locale) {
  document.documentElement.lang = locale === "zh-CN" ? "zh-CN" : "en";
}

export type I18nState = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: TranslateParams) => string;
  tStage: (stage: string) => string;
  tMessage: (message: string | null | undefined) => string | null;
  init: () => void;
};

export const useI18nStore = create<I18nState>((set, get) => ({
  locale: detectLocale(),

  init: () => {
    applyDocumentLang(get().locale);
  },

  setLocale: (locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // ignore
    }
    applyDocumentLang(locale);
    set({ locale });
  },

  t: (key, params) => translate(get().locale, key, params),

  tStage: (stage) => translateStage(get().locale, stage),

  tMessage: (message) => translateBackendMessage(get().locale, message),
}));

/** Subscribe only to locale — translate helpers read the current locale at call time. */
export function useI18n(): Pick<
  I18nState,
  "locale" | "setLocale" | "t" | "tStage" | "tMessage"
> {
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);
  return {
    locale,
    setLocale,
    t: (key, params) => translate(locale, key, params),
    tStage: (stage) => translateStage(locale, stage),
    tMessage: (message) => translateBackendMessage(locale, message),
  };
}
