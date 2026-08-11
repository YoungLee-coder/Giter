import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";

export type Locale = "en" | "zh-CN";

export const LOCALES: Locale[] = ["en", "zh-CN"];
export const STORAGE_KEY = "giter.locale";

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "zh-CN";
}

export function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // ignore
  }
  if (
    typeof navigator !== "undefined" &&
    navigator.language.toLowerCase().startsWith("zh")
  ) {
    return "zh-CN";
  }
  return "en";
}

function applyDocumentLang(locale: Locale) {
  document.documentElement.lang = locale === "zh-CN" ? "zh-CN" : "en";
}

const resources = {
  en: { translation: en },
  "zh-CN": { translation: zhCN },
};

const initialLocale = detectLocale();
applyDocumentLang(initialLocale);

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

i18n.on("languageChanged", (lng) => {
  if (isLocale(lng)) applyDocumentLang(lng);
});

export default i18n;
