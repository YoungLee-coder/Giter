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
export { I18nProvider, useI18n } from "./I18nProvider";
