import { useI18n, type Locale } from "@/i18n";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const OPTIONS: { value: Locale; labelKey: "langEn" | "langZh" }[] = [
  { value: "en", labelKey: "langEn" },
  { value: "zh-CN", labelKey: "langZh" },
];

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={locale}
      onValueChange={(value) => {
        if (value === "en" || value === "zh-CN") setLocale(value);
      }}
      aria-label={t("langLabel")}
      className="mac-segment"
    >
      {OPTIONS.map((opt) => (
        <ToggleGroupItem
          key={opt.value}
          value={opt.value}
          className="mac-segment-item mac-segment-item--lang"
        >
          {t(opt.labelKey)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
