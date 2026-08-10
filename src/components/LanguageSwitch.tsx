import { useI18n, type Locale } from "../i18n";

const OPTIONS: { value: Locale; labelKey: "langEn" | "langZh" }[] = [
  { value: "en", labelKey: "langEn" },
  { value: "zh-CN", labelKey: "langZh" },
];

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="lang-switch" role="group" aria-label={t("langLabel")}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`lang-switch__btn ${locale === opt.value ? "is-active" : ""}`}
          aria-pressed={locale === opt.value}
          onClick={() => setLocale(opt.value)}
        >
          {t(opt.labelKey)}
        </button>
      ))}
    </div>
  );
}
