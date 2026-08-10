import { useEffect, useId, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  InfoIcon,
  RefreshCwIcon,
} from "lucide-react";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/i18n";
import { APP_NAME, GITHUB_URL, RELEASES_URL } from "@/lib/app";
import type { GitInfo } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useSettingsModalStore } from "@/stores/settingsModalStore";
import { useSettings } from "@/stores/settingsStore";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SettingsModal({ open, onClose }: Props) {
  const { t } = useI18n();
  const { settings } = useSettings();
  const pane = useSettingsModalStore((s) => s.pane);
  const appInfo = useSettingsModalStore((s) => s.appInfo);
  const gitInfo = useSettingsModalStore((s) => s.gitInfo);
  const gitLoading = useSettingsModalStore((s) => s.gitLoading);
  const scanDepthDraft = useSettingsModalStore((s) => s.scanDepthDraft);
  const concurrencyDraft = useSettingsModalStore((s) => s.concurrencyDraft);
  const updateState = useSettingsModalStore((s) => s.updateState);
  const setPane = useSettingsModalStore((s) => s.setPane);
  const setScanDepthDraft = useSettingsModalStore((s) => s.setScanDepthDraft);
  const setConcurrencyDraft = useSettingsModalStore((s) => s.setConcurrencyDraft);
  const resetOnClose = useSettingsModalStore((s) => s.resetOnClose);
  const syncDraftsFromSettings = useSettingsModalStore((s) => s.syncDraftsFromSettings);
  const loadAppInfo = useSettingsModalStore((s) => s.loadAppInfo);
  const loadGitInfo = useSettingsModalStore((s) => s.loadGitInfo);
  const commitNumber = useSettingsModalStore((s) => s.commitNumber);
  const checkForUpdates = useSettingsModalStore((s) => s.checkForUpdates);
  const installUpdate = useSettingsModalStore((s) => s.installUpdate);
  const scanDepthId = useId();
  const concurrencyId = useId();
  const updateBusy =
    updateState.kind === "checking" ||
    updateState.kind === "downloading" ||
    updateState.kind === "installing";

  useEffect(() => {
    if (!open) {
      resetOnClose();
      return;
    }
    syncDraftsFromSettings();
  }, [open, settings.scanDepth, settings.concurrency, resetOnClose, syncDraftsFromSettings]);

  useEffect(() => {
    if (!open) return;
    void loadAppInfo();
    void loadGitInfo();
  }, [open, loadAppInfo, loadGitInfo]);

  useEffect(() => {
    if (!open || pane !== "git") return;
    void loadGitInfo();
  }, [open, pane, loadGitInfo]);

  const goPane = (next: "main" | "git" | "about") => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    setPane(next);
  };

  const title =
    pane === "git"
      ? t("gitInfoTitle")
      : pane === "about"
        ? t("aboutLabel")
        : t("settingsTitle");

  const updateTitle =
    updateState.kind === "available"
      ? t("downloadAndInstall")
      : updateState.kind === "checking"
        ? t("checkingForUpdates")
        : updateState.kind === "downloading"
          ? t("downloadingUpdate", { percent: updateState.percent })
          : updateState.kind === "installing"
            ? t("installingUpdate")
            : t("checkForUpdates");

  const updateHint =
    updateState.kind === "upToDate"
      ? t("upToDate")
      : updateState.kind === "available"
        ? t("updateAvailable", { version: updateState.update.version })
        : updateState.kind === "error"
          ? t("updateFailed", { error: updateState.message })
          : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={pane === "main"}
        onEscapeKeyDown={(event) => {
          if (pane !== "main") {
            event.preventDefault();
            goPane("main");
          }
        }}
      >
        <DialogHeader
          className={cn(
            "border-b border-border/70 px-4 py-3",
            pane === "main" && "pr-12",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            {pane !== "main" && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("gitInfoBack")}
                title={t("gitInfoBack")}
                onClick={() => goPane("main")}
              >
                <ArrowLeftIcon />
              </Button>
            )}
            <DialogTitle className="truncate">{title}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="settings-body min-h-[28rem] px-4 py-4">
          {pane === "main" ? (
            <div className="flex min-w-0 flex-col gap-5">
              <SettingsSection title={t("settingsSectionAppearance")}>
                <SettingsPrefRow
                  title={t("langLabel")}
                  hint={t("settingsLanguageHint")}
                  control={<LanguageSwitch />}
                />
                <SettingsPrefRow
                  title={t("themeLabel")}
                  hint={t("themeHint")}
                  control={<ThemeSwitch />}
                />
              </SettingsSection>

              <SettingsSection title={t("settingsSectionScanning")}>
                <SettingsPrefRow
                  title={t("scanDepthLabel")}
                  hint={t("scanDepthHint")}
                  htmlFor={scanDepthId}
                  control={
                    <Input
                      id={scanDepthId}
                      className="w-[4.25rem] text-center tabular-nums"
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
                  }
                />
                <SettingsPrefRow
                  title={t("concurrencyLabel")}
                  hint={t("concurrencyHint")}
                  htmlFor={concurrencyId}
                  control={
                    <Input
                      id={concurrencyId}
                      className="w-[4.25rem] text-center tabular-nums"
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
                  }
                />
              </SettingsSection>

              <SettingsSection title={t("settingsSectionSystem")}>
                <SettingsNavRow
                  icon={<GitBranchIcon />}
                  title={t("gitMenuLabel")}
                  hint={t("gitMenuHint")}
                  value={
                    appInfo == null ? (
                      "…"
                    ) : (
                      <Badge
                        variant={appInfo.gitAvailable ? "secondary" : "destructive"}
                        className="rounded-[6px]"
                      >
                        {appInfo.gitAvailable ? t("gitReady") : t("gitMissing")}
                      </Badge>
                    )
                  }
                  onClick={() => goPane("git")}
                />
                <SettingsNavRow
                  icon={
                    updateBusy ? (
                      <Spinner className="size-4" />
                    ) : (
                      <RefreshCwIcon />
                    )
                  }
                  title={updateTitle}
                  hint={updateHint}
                  hintTone={updateState.kind === "error" ? "err" : "default"}
                  disabled={updateBusy}
                  showChevron={false}
                  onClick={() => {
                    if (updateState.kind === "available") {
                      void installUpdate(updateState.update);
                      return;
                    }
                    void checkForUpdates();
                  }}
                />
                <SettingsNavRow
                  icon={<InfoIcon />}
                  title={t("aboutLabel")}
                  hint={t("aboutMenuHint")}
                  value={appInfo?.version ?? "…"}
                  onClick={() => goPane("about")}
                />
              </SettingsSection>
            </div>
          ) : pane === "git" ? (
            <GitInfoPane loading={gitLoading} info={gitInfo} />
          ) : (
            <AboutPane
              name={appInfo?.name ?? APP_NAME}
              version={appInfo?.version ?? null}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h3 className="px-0.5 text-[11px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="settings-group soft-panel flex min-w-0 flex-col divide-y divide-border/70">
        {children}
      </div>
    </section>
  );
}

function SettingsPrefRow({
  title,
  hint,
  control,
  htmlFor,
}: {
  title: string;
  hint?: string;
  control: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="settings-group-row flex w-full items-center gap-3 px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium leading-snug"
        >
          {title}
        </label>
        {hint && (
          <p className="text-xs leading-snug text-muted-foreground text-pretty">
            {hint}
          </p>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function SettingsNavRow({
  title,
  hint,
  value,
  onClick,
  disabled,
  showChevron = true,
  hintTone = "default",
  icon,
}: {
  title: string;
  hint?: string;
  value?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  showChevron?: boolean;
  hintTone?: "default" | "err";
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="settings-group-row settings-group-row--action flex w-full items-center gap-3 px-3 py-2.5 text-left disabled:pointer-events-none disabled:opacity-50"
    >
      {icon && (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-secondary text-muted-foreground [&_svg]:size-3.5">
          {icon}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium leading-snug">{title}</span>
        {hint && (
          <span
            className={cn(
              "text-xs leading-snug text-muted-foreground text-pretty",
              hintTone === "err" && "text-destructive",
            )}
          >
            {hint}
          </span>
        )}
      </div>
      {(value || showChevron) && (
        <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
          {value &&
            (typeof value === "string" ? (
              <span className="font-mono text-xs tabular-nums">{value}</span>
            ) : (
              value
            ))}
          {showChevron && <ChevronRightIcon className="size-4 opacity-60" />}
        </span>
      )}
    </button>
  );
}

function AboutPane({ name, version }: { name: string; version: string | null }) {
  const { t } = useI18n();

  const openExternal = (url: string) => {
    void openUrl(url).catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="soft-panel flex flex-col items-center gap-3 px-4 py-6 text-center">
        <img
          className="size-[4.5rem] rounded-[1.15rem] shadow-[var(--shadow-card)]"
          src="/app-icon.png"
          srcSet="/app-icon.png 1x, /app-icon@2x.png 2x"
          width={72}
          height={72}
          alt=""
        />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="font-heading text-lg font-semibold tracking-tight">
            {name}
          </div>
          <div className="text-sm text-muted-foreground">
            {t("aboutVersion", { version: version ?? "…" })}
          </div>
          <p className="mt-0.5 max-w-[22rem] text-xs leading-relaxed text-muted-foreground text-pretty">
            {t("tagline")}
          </p>
        </div>
      </div>

      <div className="settings-group soft-panel flex min-w-0 flex-col divide-y divide-border/70">
        <button
          type="button"
          onClick={() => openExternal(GITHUB_URL)}
          className="settings-group-row settings-group-row--action flex w-full items-center gap-3 px-3 py-2.5 text-left"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium">{t("aboutOpenGithub")}</span>
            <span className="text-xs text-muted-foreground">
              github.com/YoungLee-coder/giter
            </span>
          </div>
          <ExternalLinkIcon className="size-4 text-muted-foreground opacity-60" />
        </button>
        <button
          type="button"
          onClick={() => openExternal(RELEASES_URL)}
          className="settings-group-row settings-group-row--action flex w-full items-center gap-3 px-3 py-2.5 text-left"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium">{t("aboutOpenReleases")}</span>
            <span className="text-xs text-muted-foreground">
              {t("aboutOpenReleasesHint")}
            </span>
          </div>
          <ExternalLinkIcon className="size-4 text-muted-foreground opacity-60" />
        </button>
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
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
        <Spinner className="size-5" />
        <p className="text-sm">{t("gitInfoLoading")}</p>
      </div>
    );
  }

  if (!info || !info.available) {
    return (
      <div className="soft-panel soft-panel--flat px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">{t("gitInfoUnavailable")}</p>
      </div>
    );
  }

  const rows: { label: string; value: string }[] = [
    { label: t("gitInfoStatus"), value: t("gitReady") },
    { label: t("gitInfoVersion"), value: info.version ?? t("gitInfoEmpty") },
    { label: t("gitInfoPath"), value: info.path ?? t("gitInfoEmpty") },
    { label: t("gitInfoExecPath"), value: info.execPath ?? t("gitInfoEmpty") },
    { label: t("gitInfoUserName"), value: info.userName ?? t("gitInfoEmpty") },
    {
      label: t("gitInfoUserEmail"),
      value: info.userEmail ?? t("gitInfoEmpty"),
    },
  ];

  return (
    <div className="settings-group soft-panel flex min-w-0 flex-col divide-y divide-border/70">
      {rows.map((row) => (
        <div key={row.label} className="flex min-w-0 flex-col gap-1 px-3 py-2.5">
          <div className="text-[11px] font-medium tracking-[0.02em] text-muted-foreground">
            {row.label}
          </div>
          <div
            className="min-w-0 truncate font-mono text-sm select-text"
            title={row.value}
          >
            {row.value}
          </div>
        </div>
      ))}
    </div>
  );
}
