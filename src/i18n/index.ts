export {
  LOCALES,
  STORAGE_KEY,
  detectLocale,
  isLocale,
  translate,
  translateBackendMessage,
  translateStage,
} from "./core";
export type { Locale, MessageKey, Messages, TranslateParams } from "./types";
export { useI18n, useI18nStore } from "@/stores/i18nStore";
