import { en } from "./locales/en";
import { zhCN } from "./locales/zh-CN";
import type { Locale, MessageKey, Messages, TranslateParams } from "./types";

export type { Locale, MessageKey, Messages, TranslateParams } from "./types";

export const LOCALES: Locale[] = ["en", "zh-CN"];

export const STORAGE_KEY = "giter.locale";

const catalogs: Record<Locale, Messages> = {
  en,
  "zh-CN": zhCN,
};

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
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh")) {
    return "zh-CN";
  }
  return "en";
}

export function translate(
  locale: Locale,
  key: MessageKey,
  params?: TranslateParams,
): string {
  const template = catalogs[locale][key] ?? catalogs.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`,
  );
}

const STAGE_KEYS: Record<string, MessageKey> = {
  fetching: "stageFetching",
  refreshing: "stageRefreshing",
  done: "stageDone",
  error: "stageError",
  skipped: "stageSkipped",
};

const EXACT_MESSAGE_KEYS: Record<string, MessageKey> = {
  "Working tree is dirty": "msgWorkingTreeDirty",
  "No upstream branch": "msgNoUpstream",
  "Already up to date": "msgAlreadyUpToDate",
  Fetched: "msgFetched",
};

const FAST_FORWARD_RE = /^Fast-forwarded \(was behind by (\d+)\)$/;

export function translateStage(locale: Locale, stage: string): string {
  const key = STAGE_KEYS[stage];
  return key ? translate(locale, key) : stage;
}

export function translateBackendMessage(
  locale: Locale,
  message: string | null | undefined,
): string | null {
  if (!message) return null;
  const exact = EXACT_MESSAGE_KEYS[message];
  if (exact) return translate(locale, exact);
  const ff = message.match(FAST_FORWARD_RE);
  if (ff) return translate(locale, "msgFastForwarded", { count: ff[1] });
  return message;
}
