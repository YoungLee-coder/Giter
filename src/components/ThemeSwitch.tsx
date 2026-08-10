import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/i18n";
import type { ThemePreference } from "@/lib/tauri";
import { useThemeSetting } from "@/stores/settingsStore";

const OPTIONS: {
  value: ThemePreference;
  labelKey: "themeSystem" | "themeLight" | "themeDark";
  Icon: typeof SunIcon;
}[] = [
  { value: "system", labelKey: "themeSystem", Icon: MonitorIcon },
  { value: "light", labelKey: "themeLight", Icon: SunIcon },
  { value: "dark", labelKey: "themeDark", Icon: MoonIcon },
];

export function ThemeSwitch() {
  const { t } = useI18n();
  const { theme, updateSettings } = useThemeSetting();

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={theme}
      onValueChange={(value) => {
        if (value === "system" || value === "light" || value === "dark") {
          void updateSettings({ theme: value });
        }
      }}
      aria-label={t("themeLabel")}
      className="mac-segment"
    >
      {OPTIONS.map(({ value, labelKey, Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={t(labelKey)}
          title={t(labelKey)}
          className="mac-segment-item"
        >
          <Icon className="size-3.5" strokeWidth={2} />
          <span>{t(labelKey)}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
