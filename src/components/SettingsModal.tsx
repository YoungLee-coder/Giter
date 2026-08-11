import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Update } from "@tauri-apps/plugin-updater";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  InfoIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useForm, type Resolver } from "react-hook-form";
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
import { useI18n } from "@/hooks/useI18n";
import { useSettings } from "@/hooks/useSettings";
import { APP_NAME, GITHUB_URL, RELEASES_URL } from "@/lib/app";
import { settingsPane, settingsResize } from "@/lib/motion";
import {
  settingsFormSchema,
  type SettingsFormValues,
} from "@/lib/settingsSchema";
import { api, type AppInfo, type GitInfo } from "@/lib/tauri";
import {
  checkForAppUpdate,
  clearDismissedUpdateVersion,
  downloadAndInstallUpdate,
  formatUpdateError,
  markUpdateChecked,
  relaunchApp,
} from "@/lib/updater";
import { cn } from "@/lib/utils";

type SettingsPane = "main" | "git" | "about";

type UpdateUiState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; update: Update; percent: number }
  | { kind: "installing"; update: Update }
  | { kind: "error"; message: string };

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SettingsModal({ open, onClose }: Props) {
  const { t } = useI18n();
  const { settings, updateSettings } = useSettings();
  const reduceMotion = useReducedMotion();
  const [pane, setPane] = useState<SettingsPane>("main");
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateUiState>({
    kind: "idle",
  });
  const [bodyHeight, setBodyHeight] = useState<number | "auto">("auto");
  const paneContentRef = useRef<HTMLDivElement>(null);
  const resizeAnimating = useRef(false);
  const appInfoSeq = useRef(0);
  const gitInfoSeq = useRef(0);
  const gitInfoRef = useRef<GitInfo | null>(null);
  gitInfoRef.current = gitInfo;
  const scanDepthId = useId();
  const concurrencyId = useId();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema) as Resolver<SettingsFormValues>,
    defaultValues: {
      scanDepth: settings.scanDepth,
      concurrency: settings.concurrency,
    },
  });

  const updateBusy =
    updateState.kind === "checking" ||
    updateState.kind === "downloading" ||
    updateState.kind === "installing";

  const loadAppInfo = async () => {
    const seq = ++appInfoSeq.current;
    try {
      const info = await api.getAppInfo();
      if (seq !== appInfoSeq.current) return;
      setAppInfo(info);
    } catch {
      if (seq !== appInfoSeq.current) return;
      setAppInfo(null);
    }
  };

  const loadGitInfo = async () => {
    const seq = ++gitInfoSeq.current;
    if (!gitInfoRef.current) setGitLoading(true);
    try {
      const info = await api.getGitInfo();
      if (seq !== gitInfoSeq.current) return;
      setGitInfo(info);
    } catch {
      if (seq !== gitInfoSeq.current) return;
      setGitInfo(null);
    } finally {
      if (seq === gitInfoSeq.current) setGitLoading(false);
    }
  };

  const commitField = async (field: keyof SettingsFormValues) => {
    const ok = await form.trigger(field);
    if (!ok) {
      form.setValue(field, settings[field], { shouldValidate: false });
      return;
    }
    const value = form.getValues(field);
    if (value !== settings[field]) {
      void updateSettings({ [field]: value });
    }
  };

  const checkForUpdates = async () => {
    setUpdateState({ kind: "checking" });
    markUpdateChecked();
    try {
      const update = await checkForAppUpdate();
      if (!update) {
        setUpdateState({ kind: "upToDate" });
        return;
      }
      clearDismissedUpdateVersion();
      setUpdateState({ kind: "available", update });
    } catch (error) {
      setUpdateState({
        kind: "error",
        message: formatUpdateError(error),
      });
    }
  };

  const installUpdate = async (update: Update) => {
    setUpdateState({ kind: "downloading", update, percent: 0 });
    try {
      await downloadAndInstallUpdate(update, ({ downloaded, contentLength }) => {
        const percent =
          contentLength && contentLength > 0
            ? Math.min(100, Math.round((downloaded / contentLength) * 100))
            : 0;
        setUpdateState({ kind: "downloading", update, percent });
      });
      setUpdateState({ kind: "installing", update });
      await relaunchApp();
    } catch (error) {
      setUpdateState({
        kind: "error",
        message: formatUpdateError(error),
      });
    }
  };

  useEffect(() => {
    if (!open) {
      setPane("main");
      setUpdateState({ kind: "idle" });
      setBodyHeight("auto");
      resizeAnimating.current = false;
      return;
    }
    form.reset({
      scanDepth: settings.scanDepth,
      concurrency: settings.concurrency,
    });
  }, [open, settings.scanDepth, settings.concurrency, form]);

  useEffect(() => {
    if (!open) return;
    void loadAppInfo();
    void loadGitInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when opened
  }, [open]);

  useEffect(() => {
    if (!open || pane !== "git") return;
    void loadGitInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when entering git pane
  }, [open, pane]);

  // After a pane swap, measure the new content and animate height toward it.
  useLayoutEffect(() => {
    if (!open || !resizeAnimating.current || reduceMotion) return;
    const node = paneContentRef.current;
    if (!node) return;
    const next = node.offsetHeight;
    setBodyHeight((prev) => {
      if (prev === "auto" || prev === next) {
        resizeAnimating.current = false;
        return "auto";
      }
      return next;
    });
  }, [open, pane, reduceMotion, gitLoading, gitInfo, t]);

  const goPane = (next: SettingsPane) => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    if (next === pane) return;

    if (!reduceMotion && paneContentRef.current) {
      // Lock current height so the card can morph instead of snapping.
      setBodyHeight(paneContentRef.current.offsetHeight);
      resizeAnimating.current = true;
    }
    setPane(next);
  };

  const onBodyResizeComplete = () => {
    if (!resizeAnimating.current) return;
    resizeAnimating.current = false;
    setBodyHeight("auto");
  };

  const title =
    pane === "git"
      ? t("gitInfoTitle")
      : pane === "about"
        ? t("aboutLabel")
        : t("settingsTitle");

  const updateRowValue =
    updateState.kind === "checking"
      ? t("checkingForUpdates")
      : updateState.kind === "upToDate"
        ? t("upToDate")
        : updateState.kind === "available"
          ? t("updateAvailable", { version: updateState.update.version })
          : updateState.kind === "downloading"
            ? t("downloadingUpdate", { percent: updateState.percent })
            : updateState.kind === "installing"
              ? t("installingUpdate")
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

        <motion.div
          className={cn(
            "settings-body max-h-[min(85vh,calc(100dvh-6rem))] overflow-x-hidden",
            typeof bodyHeight === "number"
              ? "overflow-y-hidden"
              : "overflow-y-auto",
          )}
          initial={false}
          // Only drive height while morphing between panes. Leaving
          // `height: "auto"` in `animate` can bake a short pixel height on
          // first open and clip the last rows.
          animate={
            typeof bodyHeight === "number" ? { height: bodyHeight } : undefined
          }
          style={
            typeof bodyHeight === "number" ? undefined : { height: "auto" }
          }
          transition={
            reduceMotion ? { duration: 0 } : settingsResize.transition
          }
          onAnimationComplete={onBodyResizeComplete}
        >
          <div className="relative">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={pane}
                ref={paneContentRef}
                data-settings-pane={pane}
                className="px-4 py-4"
                initial={reduceMotion ? false : settingsPane.initial}
                animate={settingsPane.animate}
                exit={reduceMotion ? undefined : settingsPane.exit}
                transition={
                  reduceMotion ? { duration: 0 } : settingsPane.transition
                }
              >
                {pane === "main" ? (
                  <form
                    className="flex min-h-[28.5rem] min-w-0 flex-col gap-5"
                    onSubmit={form.handleSubmit((values) => {
                      const patch: Partial<SettingsFormValues> = {};
                      if (values.scanDepth !== settings.scanDepth) {
                        patch.scanDepth = values.scanDepth;
                      }
                      if (values.concurrency !== settings.concurrency) {
                        patch.concurrency = values.concurrency;
                      }
                      if (Object.keys(patch).length > 0) {
                        void updateSettings(patch);
                      }
                    })}
                  >
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
                            {...form.register("scanDepth", {
                              valueAsNumber: true,
                              onBlur: () => {
                                void commitField("scanDepth");
                              },
                            })}
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
                            {...form.register("concurrency", {
                              valueAsNumber: true,
                              onBlur: () => {
                                void commitField("concurrency");
                              },
                            })}
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
                              variant={
                                appInfo.gitAvailable
                                  ? "secondary"
                                  : "destructive"
                              }
                              className="rounded-[6px]"
                            >
                              {appInfo.gitAvailable
                                ? t("gitReady")
                                : t("gitMissing")}
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
                        title={t("checkForUpdates")}
                        value={
                          updateRowValue ? (
                            <span
                              className={cn(
                                "max-w-[11rem] truncate text-xs text-pretty",
                                updateState.kind === "error" &&
                                  "text-destructive",
                                updateState.kind === "upToDate" &&
                                  "text-muted-foreground",
                              )}
                              title={
                                updateState.kind === "error"
                                  ? updateState.message
                                  : undefined
                              }
                            >
                              {updateRowValue}
                            </span>
                          ) : undefined
                        }
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
                  </form>
                ) : pane === "git" ? (
                  <GitInfoPane loading={gitLoading} info={gitInfo} />
                ) : (
                  <AboutPane
                    name={appInfo?.name ?? APP_NAME}
                    version={appInfo?.version ?? null}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
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
