import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../i18n";
import {
  api,
  type AppInfo,
  type GitInfo,
  type ThemePreference,
} from "../lib/tauri";
import { useSettings } from "../settings";
import { LanguageSwitch } from "./LanguageSwitch";

type Props = {
  open: boolean;
  onClose: () => void;
};

type SettingsPane = "main" | "git";

const THEME_OPTIONS: {
  value: ThemePreference;
  labelKey: "themeSystem" | "themeLight" | "themeDark";
}[] = [
  { value: "system", labelKey: "themeSystem" },
  { value: "light", labelKey: "themeLight" },
  { value: "dark", labelKey: "themeDark" },
];

export function SettingsModal({ open, onClose }: Props) {
  const { t } = useI18n();
  const { settings, updateSettings } = useSettings();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState<SettingsPane>("main");
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [scanDepthDraft, setScanDepthDraft] = useState(String(settings.scanDepth));
  const [concurrencyDraft, setConcurrencyDraft] = useState(
    String(settings.concurrency),
  );
  const scanDepthId = useId();
  const concurrencyId = useId();

  useEffect(() => {
    if (!open) {
      setPane("main");
      setGitInfo(null);
      return;
    }
    setScanDepthDraft(String(settings.scanDepth));
    setConcurrencyDraft(String(settings.concurrency));
  }, [open, settings.scanDepth, settings.concurrency]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    void api
      .getAppInfo()
      .then((info) => {
        if (!cancelled) setAppInfo(info);
      })
      .catch(() => {
        if (!cancelled) setAppInfo(null);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || pane !== "git") return;

    let cancelled = false;
    setGitLoading(true);
    void api
      .getGitInfo()
      .then((info) => {
        if (!cancelled) setGitInfo(info);
      })
      .catch(() => {
        if (!cancelled) setGitInfo(null);
      })
      .finally(() => {
        if (!cancelled) setGitLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, pane]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (pane !== "main") {
        setPane("main");
        return;
      }
      onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    focusable?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, pane]);

  const commitNumber = (
    field: "scanDepth" | "concurrency",
    raw: string,
    min: number,
    max: number,
    fallback: number,
  ) => {
    const parsed = Number.parseInt(raw, 10);
    const value = Number.isFinite(parsed)
      ? Math.min(max, Math.max(min, parsed))
      : fallback;
    if (field === "scanDepth") setScanDepthDraft(String(value));
    else setConcurrencyDraft(String(value));
    if (settings[field] !== value) {
      void updateSettings({ [field]: value });
    }
  };

  if (!open) return null;

  const title =
    pane === "git" ? t("gitInfoTitle") : t("settingsTitle");

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="modal modal--settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <div className="modal__header-start">
            {pane !== "main" && (
              <button
                type="button"
                className="icon-btn ghost"
                aria-label={t("gitInfoBack")}
                title={t("gitInfoBack")}
                onClick={() => setPane("main")}
              >
                <BackIcon />
              </button>
            )}
            <h2 id="settings-title" className="modal__title">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="icon-btn ghost"
            aria-label={t("settingsClose")}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="modal__body modal__body--settings">
          {pane === "main" ? (
            <>
              <div className="settings-row">
                <div className="settings-row__label">
                  <span className="settings-row__title">{t("langLabel")}</span>
                  <span className="settings-row__hint">
                    {t("settingsLanguageHint")}
                  </span>
                </div>
                <LanguageSwitch />
              </div>

              <div className="settings-row">
                <div className="settings-row__label">
                  <span className="settings-row__title">{t("themeLabel")}</span>
                  <span className="settings-row__hint">{t("themeHint")}</span>
                </div>
                <div
                  className="lang-switch"
                  role="group"
                  aria-label={t("themeLabel")}
                >
                  {THEME_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`lang-switch__btn ${settings.theme === opt.value ? "is-active" : ""}`}
                      aria-pressed={settings.theme === opt.value}
                      onClick={() => {
                        if (settings.theme !== opt.value) {
                          void updateSettings({ theme: opt.value });
                        }
                      }}
                    >
                      {t(opt.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row__label">
                  <label className="settings-row__title" htmlFor={scanDepthId}>
                    {t("scanDepthLabel")}
                  </label>
                  <span className="settings-row__hint">{t("scanDepthHint")}</span>
                </div>
                <input
                  id={scanDepthId}
                  className="settings-number"
                  type="number"
                  min={1}
                  max={10}
                  inputMode="numeric"
                  value={scanDepthDraft}
                  onChange={(event) => setScanDepthDraft(event.target.value)}
                  onBlur={() =>
                    commitNumber(
                      "scanDepth",
                      scanDepthDraft,
                      1,
                      10,
                      settings.scanDepth,
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      (event.target as HTMLInputElement).blur();
                    }
                  }}
                />
              </div>

              <div className="settings-row">
                <div className="settings-row__label">
                  <label
                    className="settings-row__title"
                    htmlFor={concurrencyId}
                  >
                    {t("concurrencyLabel")}
                  </label>
                  <span className="settings-row__hint">
                    {t("concurrencyHint")}
                  </span>
                </div>
                <input
                  id={concurrencyId}
                  className="settings-number"
                  type="number"
                  min={1}
                  max={16}
                  inputMode="numeric"
                  value={concurrencyDraft}
                  onChange={(event) => setConcurrencyDraft(event.target.value)}
                  onBlur={() =>
                    commitNumber(
                      "concurrency",
                      concurrencyDraft,
                      1,
                      16,
                      settings.concurrency,
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      (event.target as HTMLInputElement).blur();
                    }
                  }}
                />
              </div>

              <button
                type="button"
                className="settings-row settings-row--nav"
                onClick={() => setPane("git")}
              >
                <div className="settings-row__label">
                  <span className="settings-row__title">{t("gitMenuLabel")}</span>
                  <span className="settings-row__hint">{t("gitMenuHint")}</span>
                </div>
                <span className="settings-row__trail">
                  <span className="settings-row__value">
                    {appInfo == null
                      ? "…"
                      : appInfo.gitAvailable
                        ? t("gitReady")
                        : t("gitMissing")}
                  </span>
                  <ChevronIcon />
                </span>
              </button>

              <div className="settings-about">
                <div className="settings-row__title">{t("aboutLabel")}</div>
                <div className="settings-about__meta">
                  <span>
                    {t("aboutVersion", {
                      version: appInfo?.version ?? "…",
                    })}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <GitInfoPane
              loading={gitLoading}
              info={gitInfo}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function GitInfoPane({
  loading,
  info,
}: {
  loading: boolean;
  info: GitInfo | null;
}) {
  const { t } = useI18n();

  if (loading && !info) {
    return <div className="settings-git-empty">{t("gitInfoLoading")}</div>;
  }

  if (!info || !info.available) {
    return (
      <div className="settings-git-empty">{t("gitInfoUnavailable")}</div>
    );
  }

  const rows: { label: string; value: string }[] = [
    {
      label: t("gitInfoStatus"),
      value: t("gitReady"),
    },
    {
      label: t("gitInfoVersion"),
      value: info.version ?? t("gitInfoEmpty"),
    },
    {
      label: t("gitInfoPath"),
      value: info.path ?? t("gitInfoEmpty"),
    },
    {
      label: t("gitInfoExecPath"),
      value: info.execPath ?? t("gitInfoEmpty"),
    },
    {
      label: t("gitInfoUserName"),
      value: info.userName ?? t("gitInfoEmpty"),
    },
    {
      label: t("gitInfoUserEmail"),
      value: info.userEmail ?? t("gitInfoEmpty"),
    },
  ];

  return (
    <div className="settings-git-list">
      {rows.map((row) => (
        <div key={row.label} className="settings-git-row">
          <div className="settings-git-row__label">{row.label}</div>
          <div className="settings-git-row__value" title={row.value}>
            {row.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M7.4 2.1a.75.75 0 0 1 .05 1.06L4.86 6l2.59 2.84a.75.75 0 1 1-1.11 1.01L3.2 6.53a.75.75 0 0 1 0-1.06l2.14-3.32a.75.75 0 0 1 1.06-.05Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M3.2 1.3a.75.75 0 0 1 1.06.05L7.05 4.5 4.26 7.65a.75.75 0 1 1-1.11-1.01L5.34 4.5 3.15 2.36a.75.75 0 0 1 .05-1.06Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M2.1 2.1a.75.75 0 0 1 1.06 0L6 4.94l2.84-2.84a.75.75 0 1 1 1.06 1.06L7.06 6l2.84 2.84a.75.75 0 1 1-1.06 1.06L6 7.06 3.16 9.9a.75.75 0 0 1-1.06-1.06L4.94 6 2.1 3.16a.75.75 0 0 1 0-1.06Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8.7 1.2a.9.9 0 0 0-1.4 0l-.35.42a1.4 1.4 0 0 1-1.45.4l-.52-.17a.9.9 0 0 0-1.08.5l-.35.9a.9.9 0 0 0 .3 1.07l.42.33a1.4 1.4 0 0 1 0 2.16l-.42.33a.9.9 0 0 0-.3 1.07l.35.9a.9.9 0 0 0 1.08.5l.52-.17a1.4 1.4 0 0 1 1.45.4l.35.42a.9.9 0 0 0 1.4 0l.35-.42a1.4 1.4 0 0 1 1.45-.4l.52.17a.9.9 0 0 0 1.08-.5l.35-.9a.9.9 0 0 0-.3-1.07l-.42-.33a1.4 1.4 0 0 1 0-2.16l.42-.33a.9.9 0 0 0 .3-1.07l-.35-.9a.9.9 0 0 0-1.08-.5l-.52.17a1.4 1.4 0 0 1-1.45-.4L8.7 1.2ZM8 10.1A2.1 2.1 0 1 1 8 5.9a2.1 2.1 0 0 1 0 4.2Z"
      />
    </svg>
  );
}
