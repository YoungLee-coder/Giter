import {
  useEffect,
  useId,
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
  ArrowUpCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  ExternalLinkIcon,
  GitCommitHorizontalIcon,
  LogInIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  ScanSearchIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";
import { useForm, type Resolver } from "react-hook-form";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/hooks/useI18n";
import { useSettings } from "@/hooks/useSettings";
import { APP_NAME, GITHUB_URL, RELEASES_URL } from "@/lib/app";
import { settingsPane, collapse } from "@/lib/motion";
import {
  settingsFormSchema,
  type SettingsFormValues,
} from "@/lib/settingsSchema";
import {
  api,
  type AppInfo,
  type GitInfo,
  type GithubProtocol,
  type GithubPublishInfo,
} from "@/lib/tauri";
import {
  checkForAppUpdate,
  clearDismissedUpdateVersion,
  downloadAndInstallUpdate,
  formatUpdateError,
  markUpdateChecked,
  relaunchApp,
} from "@/lib/updater";
import { cn } from "@/lib/utils";

type SettingsTab = "general" | "scanning" | "git" | "about";

type UpdateUiState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; update: Update; percent: number }
  | { kind: "installing"; update: Update }
  | { kind: "error"; message: string };

type Props = {
  onBack: () => void;
};

const TABS: {
  id: SettingsTab;
  labelKey: string;
  Icon: typeof SlidersHorizontalIcon;
}[] = [
  {
    id: "general",
    labelKey: "settingsTabGeneral",
    Icon: SlidersHorizontalIcon,
  },
  {
    id: "scanning",
    labelKey: "settingsTabScanning",
    Icon: ScanSearchIcon,
  },
  {
    id: "git",
    labelKey: "settingsTabGit",
    Icon: GitCommitHorizontalIcon,
  },
  {
    id: "about",
    labelKey: "settingsTabAbout",
    Icon: CircleHelpIcon,
  },
];

export function SettingsPage({ onBack }: Props) {
  const { t } = useI18n();
  const { settings, updateSettings } = useSettings();
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<SettingsTab>("general");
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateUiState>({
    kind: "idle",
  });
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

  const activeTab = TABS.find((item) => item.id === tab) ?? TABS[0];

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

  const nudgeField = async (
    field: keyof SettingsFormValues,
    delta: number,
    min: number,
    max: number,
  ) => {
    const current = form.getValues(field);
    const next = Math.min(max, Math.max(min, (Number.isFinite(current) ? current : min) + delta));
    form.setValue(field, next, { shouldValidate: true, shouldDirty: true });
    await commitField(field);
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
    form.reset({
      scanDepth: settings.scanDepth,
      concurrency: settings.concurrency,
    });
  }, [settings.scanDepth, settings.concurrency, form]);

  useEffect(() => {
    void loadAppInfo();
    void loadGitInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  useEffect(() => {
    if (tab !== "git") return;
    void loadGitInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when entering git tab
  }, [tab]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onBack();
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.key !== "[") return;
      event.preventDefault();
      onBack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack]);

  const updateStatus =
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
                : null;

  return (
    <div className="settings-shell flex min-h-0 flex-1 overflow-hidden">
      <aside className="settings-sidebar" aria-label={t("settingsTitle")}>
        <nav className="settings-nav">
          {TABS.map(({ id, labelKey, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                className="settings-nav-item"
                data-active={active ? "true" : "false"}
                aria-current={active ? "page" : undefined}
                onClick={() => setTab(id)}
              >
                <span className="settings-nav-icon">
                  <Icon className="size-4" strokeWidth={1.75} />
                </span>
                <span className="settings-nav-label">{t(labelKey)}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="settings-body giter-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="settings-content">
          <nav
            className="settings-mobile-nav"
            aria-label={t("settingsTitle")}
          >
            {TABS.map(({ id, labelKey }) => (
              <button
                key={id}
                type="button"
                className="settings-mobile-tab"
                data-active={tab === id ? "true" : "false"}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => setTab(id)}
              >
                {t(labelKey)}
              </button>
            ))}
          </nav>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              data-settings-tab={tab}
              initial={reduceMotion ? false : settingsPane.initial}
              animate={settingsPane.animate}
              exit={reduceMotion ? undefined : settingsPane.exit}
              transition={
                reduceMotion ? { duration: 0 } : settingsPane.transition
              }
            >
              <header className="settings-pane-header">
                <div className="settings-pane-icon">
                  <activeTab.Icon className="size-5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <h2 className="settings-pane-title">{t(activeTab.labelKey)}</h2>
                  <p className="settings-pane-desc text-pretty">
                    {tab === "general"
                      ? t("settingsGeneralHint")
                      : tab === "scanning"
                        ? t("settingsScanningHint")
                        : tab === "git"
                          ? t("gitMenuHint")
                          : t("aboutMenuHint")}
                  </p>
                </div>
              </header>

              {tab === "general" ? (
                <GeneralTab />
              ) : tab === "scanning" ? (
                <ScanningTab
                  form={form}
                  scanDepthId={scanDepthId}
                  concurrencyId={concurrencyId}
                  commitField={commitField}
                  nudgeField={nudgeField}
                />
              ) : tab === "git" ? (
                <GitTab
                  appInfo={appInfo}
                  gitInfo={gitInfo}
                  gitLoading={gitLoading}
                  active={tab === "git"}
                  onGitIdentityMaybeChanged={() => void loadGitInfo()}
                />
              ) : (
                <AboutTab
                  name={appInfo?.name ?? APP_NAME}
                  version={appInfo?.version ?? null}
                  updateBusy={updateBusy}
                  updateStatus={updateStatus}
                  updateState={updateState}
                  onCheckForUpdates={() => void checkForUpdates()}
                  onInstallUpdate={(update) => void installUpdate(update)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function GeneralTab() {
  const { t } = useI18n();

  return (
    <section className="settings-section" aria-label={t("settingsSectionAppearance")}>
      <SettingsSectionLabel>{t("settingsSectionAppearance")}</SettingsSectionLabel>
      <div className="settings-field-group soft-panel">
        <SettingsFieldRow
          title={t("langLabel")}
          description={t("settingsLanguageDescription")}
        >
          <div className="[&_[data-slot=toggle-group]]:w-full [&_[data-slot=toggle-group-item]]:flex-1">
            <LanguageSwitch />
          </div>
        </SettingsFieldRow>
        <SettingsFieldRow title={t("themeLabel")} description={t("themeHint")}>
          <div className="[&_[data-slot=toggle-group]]:w-full [&_[data-slot=toggle-group-item]]:flex-1">
            <ThemeSwitch />
          </div>
        </SettingsFieldRow>
      </div>
    </section>
  );
}

function ScanningTab({
  form,
  scanDepthId,
  concurrencyId,
  commitField,
  nudgeField,
}: {
  form: ReturnType<typeof useForm<SettingsFormValues>>;
  scanDepthId: string;
  concurrencyId: string;
  commitField: (field: keyof SettingsFormValues) => Promise<void>;
  nudgeField: (
    field: keyof SettingsFormValues,
    delta: number,
    min: number,
    max: number,
  ) => Promise<void>;
}) {
  const { t } = useI18n();

  return (
    <form
      className="settings-section"
      aria-label={t("settingsSectionScanning")}
      onSubmit={form.handleSubmit(() => undefined)}
    >
      <SettingsSectionLabel>{t("settingsSectionScanning")}</SettingsSectionLabel>
      <div className="settings-field-group soft-panel">
        <SettingsFieldRow
          title={t("scanDepthLabel")}
          description={t("scanDepthHint")}
        >
          <NumberStepper
            id={scanDepthId}
            min={1}
            max={10}
            value={form.watch("scanDepth")}
            decrementLabel={`${t("scanDepthLabel")} −`}
            incrementLabel={`${t("scanDepthLabel")} +`}
            onDecrement={() => void nudgeField("scanDepth", -1, 1, 10)}
            onIncrement={() => void nudgeField("scanDepth", 1, 1, 10)}
            inputProps={form.register("scanDepth", {
              valueAsNumber: true,
              onBlur: () => {
                void commitField("scanDepth");
              },
            })}
          />
        </SettingsFieldRow>
        <SettingsFieldRow
          title={t("concurrencyLabel")}
          description={t("concurrencyHint")}
        >
          <NumberStepper
            id={concurrencyId}
            min={1}
            max={16}
            value={form.watch("concurrency")}
            decrementLabel={`${t("concurrencyLabel")} −`}
            incrementLabel={`${t("concurrencyLabel")} +`}
            onDecrement={() => void nudgeField("concurrency", -1, 1, 16)}
            onIncrement={() => void nudgeField("concurrency", 1, 1, 16)}
            inputProps={form.register("concurrency", {
              valueAsNumber: true,
              onBlur: () => {
                void commitField("concurrency");
              },
            })}
          />
        </SettingsFieldRow>
      </div>
    </form>
  );
}

function GitTab({
  appInfo,
  gitInfo,
  gitLoading,
  active,
  onGitIdentityMaybeChanged,
}: {
  appInfo: AppInfo | null;
  gitInfo: GitInfo | null;
  gitLoading: boolean;
  active: boolean;
  onGitIdentityMaybeChanged: () => void;
}) {
  const { t } = useI18n();
  const available = appInfo?.gitAvailable ?? gitInfo?.available ?? false;
  const [githubSignedIn, setGithubSignedIn] = useState(false);
  const [identitySyncing, setIdentitySyncing] = useState(false);
  const [identityMessage, setIdentityMessage] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);

  const applyGithubIdentity = async (overwrite: boolean) => {
    setIdentitySyncing(true);
    setIdentityError(null);
    try {
      const result = await api.syncGitIdentityFromGithub(overwrite);
      onGitIdentityMaybeChanged();
      if (result.nameUpdated || result.emailUpdated) {
        setIdentityMessage(
          overwrite
            ? t("settingsGithubIdentityApplied")
            : t("settingsGithubIdentitySynced"),
        );
      } else {
        setIdentityMessage(t("settingsGithubIdentityUnchanged"));
      }
    } catch (err) {
      setIdentityMessage(null);
      setIdentityError(err instanceof Error ? err.message : String(err));
    } finally {
      setIdentitySyncing(false);
    }
  };

  return (
    <div className="settings-section space-y-5">
      <div
        className={cn(
          "settings-status-card",
          available ? "settings-status-card--ok" : "settings-status-card--warn",
        )}
      >
        <div className="min-w-0">
          <div className="settings-status-card-title">
            {t("settingsSectionGit")}
          </div>
          <p className="settings-status-card-desc text-pretty">
            {available ? t("gitMenuHint") : t("gitMissingBanner")}
          </p>
        </div>
        <Badge
          variant={available ? "secondary" : "destructive"}
          className="shrink-0 rounded-[6px]"
        >
          {available ? t("gitReady") : t("gitMissing")}
        </Badge>
      </div>

      <GitInfoPanel
        loading={gitLoading}
        info={gitInfo}
        githubSignedIn={githubSignedIn}
        identitySyncing={identitySyncing}
        identityMessage={identityMessage}
        identityError={identityError}
        onUseGithubIdentity={() => void applyGithubIdentity(true)}
        onIdentitySaved={onGitIdentityMaybeChanged}
      />
      <GithubAccountPanel
        active={active}
        onSignedInChange={setGithubSignedIn}
        onLoginSynced={() => void applyGithubIdentity(false)}
      />
    </div>
  );
}

const GH_CLI_URL = "https://cli.github.com/";

function GithubAccountPanel({
  active,
  onSignedInChange,
  onLoginSynced,
}: {
  active: boolean;
  onSignedInChange: (signedIn: boolean) => void;
  onLoginSynced: () => void;
}) {
  const { t } = useI18n();
  const [info, setInfo] = useState<GithubPublishInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState<GithubProtocol | null>(null);
  const [error, setError] = useState<string | null>(null);
  const infoSeq = useRef(0);
  const infoRef = useRef<GithubPublishInfo | null>(null);
  const loggingInRef = useRef<GithubProtocol | null>(null);
  const loginSyncedRef = useRef(false);
  infoRef.current = info;
  loggingInRef.current = loggingIn;

  const load = async () => {
    const seq = ++infoSeq.current;
    if (!infoRef.current) setLoading(true);
    try {
      const next = await api.githubPublishInfo();
      if (seq !== infoSeq.current) return;
      const wasPendingLogin = loggingInRef.current !== null;
      setInfo(next);
      setError(null);
      onSignedInChange(Boolean(next.login));
      if (next.login) {
        const pending = loggingInRef.current;
        if (pending !== "ssh" || next.gitProtocol === "ssh") {
          setLoggingIn(null);
          if (wasPendingLogin && !loginSyncedRef.current) {
            loginSyncedRef.current = true;
            onLoginSynced();
          }
        }
      } else {
        onSignedInChange(false);
      }
    } catch (err) {
      if (seq !== infoSeq.current) return;
      setInfo(null);
      onSignedInChange(false);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (seq === infoSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when git tab is shown
  }, [active]);

  useEffect(() => {
    if (!active || !loggingIn) return;
    loginSyncedRef.current = false;
    const id = window.setInterval(() => {
      void load();
    }, 2500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll while waiting for gh auth
  }, [active, loggingIn]);

  const openExternal = (url: string) => {
    void openUrl(url).catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
  };

  const startLogin = async (protocol: GithubProtocol) => {
    setError(null);
    loginSyncedRef.current = false;
    setLoggingIn(protocol);
    try {
      await api.startGithubLogin(protocol);
    } catch (err) {
      setLoggingIn(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const signedIn = Boolean(info?.login);
  const ghMissing = Boolean(info && !info.available);
  const needsLogin = Boolean(info?.available && !info.login);
  const protocol = info?.gitProtocol === "ssh" ? "ssh" : info?.gitProtocol === "https" ? "https" : null;
  const usingSsh = protocol === "ssh";
  const canSetupSsh = signedIn && !usingSsh;

  let description = t("settingsGithubHint");
  if (loading && !info) {
    description = t("settingsGithubLoading");
  } else if (ghMissing) {
    description = t("settingsGithubMissing");
  } else if (needsLogin) {
    description = loggingIn
      ? t("settingsGithubWaiting")
      : t("settingsGithubSignInHint");
  } else if (signedIn) {
    description = usingSsh
      ? t("settingsGithubConnectedSshHint", { login: info!.login! })
      : t("settingsGithubConnectedHttpsHint", { login: info!.login! });
    if (loggingIn === "ssh") {
      description = t("settingsGithubWaitingSsh");
    }
  }

  return (
    <section aria-label={t("settingsGitGithub")}>
      <SettingsSectionLabel>{t("settingsGitGithub")}</SettingsSectionLabel>
      <div
        className={cn(
          "settings-status-card",
          signedIn && (usingSsh || !loggingIn)
            ? "settings-status-card--ok"
            : "settings-status-card--warn",
        )}
      >
        <div className="min-w-0">
          <div className="settings-status-card-title">
            {t("settingsGitGithub")}
          </div>
          <p className="settings-status-card-desc text-pretty">{description}</p>
          {error && (
            <p className="mt-2 text-xs text-destructive text-pretty" title={error}>
              {error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {loading && !info ? (
            <Spinner className="size-4" />
          ) : signedIn ? (
            <>
              <Badge variant="secondary" className="rounded-[6px] font-mono">
                @{info!.login}
              </Badge>
              {protocol && (
                <Badge variant="outline" className="rounded-[6px] uppercase">
                  {protocol}
                </Badge>
              )}
              {canSetupSsh && (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => void startLogin("ssh")}
                  disabled={loggingIn !== null}
                >
                  {loggingIn === "ssh" ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <LogInIcon className="size-3.5" />
                  )}
                  {loggingIn === "ssh"
                    ? t("settingsGithubSigningIn")
                    : t("settingsGithubSetupSsh")}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => void load()}
                disabled={loading}
              >
                {loading ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <RefreshCwIcon className="size-3.5" />
                )}
                {t("settingsGithubRefresh")}
              </Button>
            </>
          ) : ghMissing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => openExternal(GH_CLI_URL)}
            >
              <ExternalLinkIcon className="size-3.5" />
              {t("settingsGithubInstallGh")}
            </Button>
          ) : needsLogin ? (
            <>
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => void startLogin("https")}
                disabled={loggingIn !== null}
              >
                {loggingIn === "https" ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <LogInIcon className="size-3.5" />
                )}
                {loggingIn === "https"
                  ? t("settingsGithubSigningIn")
                  : t("settingsGithubSignInHttps")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => void startLogin("ssh")}
                disabled={loggingIn !== null}
              >
                {loggingIn === "ssh" ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <LogInIcon className="size-3.5" />
                )}
                {loggingIn === "ssh"
                  ? t("settingsGithubSigningIn")
                  : t("settingsGithubSignInSsh")}
              </Button>
              {loggingIn && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => void load()}
                >
                  <RefreshCwIcon className="size-3.5" />
                  {t("settingsGithubRefresh")}
                </Button>
              )}
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void load()}
            >
              <RefreshCwIcon className="size-3.5" />
              {t("settingsGithubRefresh")}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function AboutTab({
  name,
  version,
  updateBusy,
  updateStatus,
  updateState,
  onCheckForUpdates,
  onInstallUpdate,
}: {
  name: string;
  version: string | null;
  updateBusy: boolean;
  updateStatus: string | null;
  updateState: UpdateUiState;
  onCheckForUpdates: () => void;
  onInstallUpdate: (update: Update) => void;
}) {
  const { t } = useI18n();

  const openExternal = (url: string) => {
    void openUrl(url).catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
  };

  const handleUpdateAction = () => {
    if (updateState.kind === "available") {
      onInstallUpdate(updateState.update);
      return;
    }
    onCheckForUpdates();
  };

  const updateButtonLabel =
    updateState.kind === "available"
      ? t("downloadAndInstall")
      : updateState.kind === "checking"
        ? t("checkingForUpdates")
        : t("checkForUpdates");

  return (
    <div className="settings-section space-y-5">
      <div className="settings-about-hero">
        <div className="settings-about-brand">
          <img
            className="settings-about-logo"
            src="/app-icon.png"
            srcSet="/app-icon.png 1x, /app-icon@2x.png 2x"
            width={72}
            height={72}
            alt=""
          />
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="font-heading text-xl font-semibold tracking-tight">
              {name}
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              {t("tagline")}
            </p>
            <Badge
              variant="secondary"
              className="w-fit rounded-[6px] font-mono text-xs"
            >
              {t("aboutVersion", { version: version ?? "…" })}
            </Badge>
          </div>
        </div>
      </div>

      <section aria-label={t("settingsUpdates")}>
        <SettingsSectionLabel>{t("settingsUpdates")}</SettingsSectionLabel>
        <div className="settings-field-group soft-panel">
          <div className="settings-field-row settings-field-row--stack">
            <div className="settings-field-row-label">
              <span className="settings-field-row-title">
                {updateState.kind === "available"
                  ? t("updateAvailable", {
                      version: updateState.update.version,
                    })
                  : t("aboutVersion", { version: version ?? "…" })}
              </span>
              <span className="settings-field-row-desc text-pretty">
                {updateStatus ?? t("aboutOpenReleasesHint")}
              </span>
            </div>
            <div className="settings-field-row-control">
              <Button
                type="button"
                variant={updateState.kind === "available" ? "default" : "outline"}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={updateBusy}
                onClick={handleUpdateAction}
              >
                {updateBusy ? (
                  <Spinner className="size-3.5" />
                ) : updateState.kind === "available" ? (
                  <ArrowUpCircleIcon className="size-3.5" />
                ) : (
                  <RefreshCwIcon className="size-3.5" />
                )}
                {updateButtonLabel}
              </Button>
            </div>
          </div>
          {(updateState.kind === "downloading" ||
            updateState.kind === "installing") && (
            <div className="settings-update-progress">
              <div
                className="settings-update-progress-bar"
                style={{
                  width:
                    updateState.kind === "installing"
                      ? "100%"
                      : `${updateState.percent}%`,
                }}
              />
            </div>
          )}
          {updateState.kind === "error" && (
            <div
              className="settings-update-banner settings-update-banner--error text-pretty"
              title={updateState.message}
            >
              {updateStatus}
            </div>
          )}
        </div>
      </section>

      <section aria-label={t("aboutLabel")}>
        <SettingsSectionLabel>{t("aboutLabel")}</SettingsSectionLabel>
        <div className="settings-field-group soft-panel">
          <SettingsLinkRow
            title={t("aboutOpenGithub")}
            description={GITHUB_URL.replace(/^https?:\/\//, "")}
            onClick={() => openExternal(GITHUB_URL)}
          />
          <SettingsLinkRow
            title={t("aboutOpenReleases")}
            description={t("aboutOpenReleasesHint")}
            onClick={() => openExternal(RELEASES_URL)}
          />
        </div>
      </section>
    </div>
  );
}

function SettingsSectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="settings-section-label">{children}</h3>;
}

function SettingsFieldRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-field-row">
      <div className="settings-field-row-label">
        <span className="settings-field-row-title">{title}</span>
        {description && (
          <span className="settings-field-row-desc text-pretty">
            {description}
          </span>
        )}
      </div>
      <div className="settings-field-row-control">{children}</div>
    </div>
  );
}

function SettingsLinkRow({
  title,
  description,
  onClick,
}: {
  title: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="settings-link-row"
      onClick={onClick}
    >
      <span className="settings-field-row-label">
        <span className="settings-field-row-title">{title}</span>
        {description && (
          <span className="settings-field-row-desc text-pretty">
            {description}
          </span>
        )}
      </span>
      <span className="settings-link-row-meta">
        <ExternalLinkIcon className="size-3.5 opacity-60" />
        <ChevronRightIcon className="size-4 opacity-45" />
      </span>
    </button>
  );
}

function NumberStepper({
  id,
  min,
  max,
  value,
  onDecrement,
  onIncrement,
  inputProps,
  decrementLabel,
  incrementLabel,
}: {
  id: string;
  min: number;
  max: number;
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementLabel: string;
  incrementLabel: string;
  inputProps: ReturnType<ReturnType<typeof useForm<SettingsFormValues>>["register"]>;
}) {
  const atMin = !Number.isFinite(value) || value <= min;
  const atMax = Number.isFinite(value) && value >= max;

  return (
    <div className="settings-stepper">
      <button
        type="button"
        className="settings-stepper-btn"
        aria-label={decrementLabel}
        disabled={atMin}
        onClick={onDecrement}
      >
        <MinusIcon className="size-3.5" strokeWidth={2.5} />
      </button>
      <Input
        id={id}
        className="settings-stepper-input"
        type="number"
        min={min}
        max={max}
        inputMode="numeric"
        {...inputProps}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
      <button
        type="button"
        className="settings-stepper-btn"
        aria-label={incrementLabel}
        disabled={atMax}
        onClick={onIncrement}
      >
        <PlusIcon className="size-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

function GitInfoPanel({
  loading,
  info,
  githubSignedIn,
  identitySyncing,
  identityMessage,
  identityError,
  onUseGithubIdentity,
  onIdentitySaved,
}: {
  loading: boolean;
  info: GitInfo | null;
  githubSignedIn: boolean;
  identitySyncing: boolean;
  identityMessage: string | null;
  identityError: string | null;
  onUseGithubIdentity: () => void;
  onIdentitySaved: () => void;
}) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const [editingField, setEditingField] = useState<"user.name" | "user.email" | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  if (loading && !info) {
    return (
      <div className="soft-panel flex items-center justify-center gap-2 px-4 py-10 text-muted-foreground">
        <Spinner className="size-4" />
        <p className="text-sm">{t("gitInfoLoading")}</p>
      </div>
    );
  }

  if (!info || !info.available) {
    return (
      <div className="soft-panel px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">{t("gitInfoUnavailable")}</p>
      </div>
    );
  }

  const installRows: { label: string; value: string }[] = [
    { label: t("gitInfoVersion"), value: info.version ?? t("gitInfoEmpty") },
    { label: t("gitInfoPath"), value: info.path ?? t("gitInfoEmpty") },
    { label: t("gitInfoExecPath"), value: info.execPath ?? t("gitInfoEmpty") },
  ];

  const startEdit = (field: "user.name" | "user.email") => {
    setEditingField(field);
    setDraft(
      field === "user.name" ? (info.userName ?? "") : (info.userEmail ?? ""),
    );
    setFieldError(null);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setDraft("");
    setFieldError(null);
  };

  const saveEdit = async () => {
    if (!editingField) return;
    const value = draft.trim();
    if (!value) {
      setFieldError(
        editingField === "user.name"
          ? t("gitInfoNameRequired")
          : t("gitInfoEmailInvalid"),
      );
      return;
    }
    if (editingField === "user.email" && !value.includes("@")) {
      setFieldError(t("gitInfoEmailInvalid"));
      return;
    }

    setSaving(true);
    setFieldError(null);
    try {
      await api.setGitIdentityField(editingField, value);
      setEditingField(null);
      setDraft("");
      onIdentitySaved();
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <SettingsSectionLabel>{t("settingsGitInstall")}</SettingsSectionLabel>
        <div className="settings-group soft-panel flex min-w-0 flex-col divide-y divide-border/70">
          {installRows.map((row) => (
            <GitInfoRow key={row.label} label={row.label} value={row.value} />
          ))}
        </div>
      </section>
      <section>
        <SettingsSectionLabel>{t("settingsGitIdentity")}</SettingsSectionLabel>
        <div className="settings-group soft-panel flex min-w-0 flex-col divide-y divide-border/70">
          <GitIdentityRow
            label={t("gitInfoUserName")}
            value={info.userName}
            emptyLabel={t("gitInfoEmpty")}
            editing={editingField === "user.name"}
            draft={editingField === "user.name" ? draft : ""}
            saving={saving && editingField === "user.name"}
            disabled={
              identitySyncing ||
              (editingField !== null && editingField !== "user.name")
            }
            onDraftChange={setDraft}
            onEdit={() => startEdit("user.name")}
            onCancel={cancelEdit}
            onSave={() => void saveEdit()}
            editLabel={t("gitInfoEdit")}
            saveLabel={saving ? t("gitInfoSaving") : t("gitInfoSave")}
            cancelLabel={t("gitInfoCancel")}
            inputType="text"
          />
          <GitIdentityRow
            label={t("gitInfoUserEmail")}
            value={info.userEmail}
            emptyLabel={t("gitInfoEmpty")}
            editing={editingField === "user.email"}
            draft={editingField === "user.email" ? draft : ""}
            saving={saving && editingField === "user.email"}
            disabled={
              identitySyncing ||
              (editingField !== null && editingField !== "user.email")
            }
            onDraftChange={setDraft}
            onEdit={() => startEdit("user.email")}
            onCancel={cancelEdit}
            onSave={() => void saveEdit()}
            editLabel={t("gitInfoEdit")}
            saveLabel={saving ? t("gitInfoSaving") : t("gitInfoSave")}
            cancelLabel={t("gitInfoCancel")}
            inputType="email"
          />
          <AnimatePresence initial={false}>
            {githubSignedIn && (
              <motion.div
                key="github-identity-action"
                className="overflow-hidden"
                initial={reduceMotion ? false : collapse.initial}
                animate={collapse.animate}
                exit={reduceMotion ? undefined : collapse.exit}
                transition={
                  reduceMotion ? { duration: 0 } : collapse.transition
                }
              >
                <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <p className="min-w-0 text-xs text-muted-foreground text-pretty">
                    {t("settingsGithubIdentityHint")}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 text-xs"
                    disabled={identitySyncing || editingField !== null}
                    onClick={onUseGithubIdentity}
                  >
                    {identitySyncing ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <LogInIcon className="size-3.5" />
                    )}
                    {t("settingsGithubUseIdentity")}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {fieldError && (
          <p className="mt-2 text-xs text-destructive text-pretty" title={fieldError}>
            {fieldError}
          </p>
        )}
        {identityMessage && (
          <p className="mt-2 text-xs text-muted-foreground text-pretty">
            {identityMessage}
          </p>
        )}
        {identityError && (
          <p className="mt-2 text-xs text-destructive text-pretty" title={identityError}>
            {identityError}
          </p>
        )}
      </section>
    </div>
  );
}

function GitIdentityRow({
  label,
  value,
  emptyLabel,
  editing,
  draft,
  saving,
  disabled,
  onDraftChange,
  onEdit,
  onCancel,
  onSave,
  editLabel,
  saveLabel,
  cancelLabel,
  inputType,
}: {
  label: string;
  value: string | null;
  emptyLabel: string;
  editing: boolean;
  draft: string;
  saving: boolean;
  disabled: boolean;
  onDraftChange: (value: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  editLabel: string;
  saveLabel: string;
  cancelLabel: string;
  inputType: "text" | "email";
}) {
  const display = value?.trim() ? value : emptyLabel;

  return (
    <div className="flex min-w-0 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="shrink-0 text-[11px] font-medium tracking-[0.02em] text-muted-foreground">
        {label}
      </div>
      {editing ? (
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Input
            type={inputType}
            value={draft}
            autoFocus
            disabled={saving}
            className="h-8 font-mono text-sm sm:max-w-xs sm:text-right"
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSave();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
              }
            }}
          />
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={saving}
              onClick={onSave}
            >
              {saving ? (
                <Spinner className="size-3.5" />
              ) : (
                <CheckIcon className="size-3.5" />
              )}
              {saveLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={saving}
              onClick={onCancel}
            >
              <XIcon className="size-3.5" />
              {cancelLabel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-end">
          <div
            className="min-w-0 truncate font-mono text-sm select-text sm:text-right"
            title={display}
          >
            {display}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1.5 px-2 text-xs"
            disabled={disabled}
            onClick={onEdit}
            aria-label={editLabel}
            title={editLabel}
          >
            <PencilIcon className="size-3.5" />
            <span className="hidden sm:inline">{editLabel}</span>
          </Button>
        </div>
      )}
    </div>
  );
}

function GitInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <div className="shrink-0 text-[11px] font-medium tracking-[0.02em] text-muted-foreground">
        {label}
      </div>
      <div
        className="min-w-0 truncate font-mono text-sm select-text sm:text-right"
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
