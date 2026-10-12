import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { listen } from "@tauri-apps/api/event";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  ArrowUpCircleIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  CloudDownloadIcon,
  InfoIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
} from "lucide-react";
import { toast } from "sonner";
import { BatchBar, RepoList } from "@/components/repo";
import { RemoteRenameDialog } from "@/components/RemoteRenameDialog";
import { CloneInitDialog } from "@/components/workspace/CloneInitDialog";
import { WorkspacePage } from "@/components/workspace/WorkspacePage";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { useAppUi } from "@/hooks/AppUiProvider";
import { useI18n } from "@/hooks/useI18n";
import {
  useGitOkQuery,
  useReorderReposMutation,
  useRepoActions,
  useReposQuery,
} from "@/hooks/useRepos";
import { useSettings } from "@/hooks/useSettings";
import { APP_NAME } from "@/lib/app";
import { fadePage } from "@/lib/motion";
import { queueProgress } from "@/lib/progressBus";
import { DRAG_REGION_ATTR, DRAG_REGION_STYLE, getDragBarHeight } from "@/lib/platform";
import { api, type BatchProgress } from "@/lib/tauri";
import {
  checkForAppUpdate,
  dismissUpdateVersion,
  downloadAndInstallUpdate,
  formatUpdateError,
  getDismissedUpdateVersion,
  markUpdateChecked,
  relaunchApp,
  shouldAutoCheckForUpdate,
} from "@/lib/updater";
import { cn } from "@/lib/utils";
import "./App.css";

const SettingsPage = lazy(() =>
  import("@/components/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

const DEFAULT_DRAG_BAR_HEIGHT = getDragBarHeight();
const HEADER_HEIGHT = 48;
/**
 * The drag strip is always reserved at the top of the shell. Pages that use the
 * shared fixed app header (home, settings) also reserve `HEADER_HEIGHT`; the repo
 * workspace renders its own topbar instead, so it would otherwise leave a 48px
 * hole between the title bar and its header.
 */
const DRAG_BAR_OFFSET = { paddingTop: DEFAULT_DRAG_BAR_HEIGHT } as CSSProperties;
const PAGE_HEADER_INSET = { paddingTop: HEADER_HEIGHT } as CSSProperties;

function App() {
  const {
    isMac,
    settingsOpen,
    setSettingsOpen,
    setAvailableUpdate,
    detailRepo,
    setDetailRepo,
  } = useAppUi();
  const reduceMotion = useReducedMotion();
  const pageTransition = reduceMotion ? { duration: 0 } : fadePage.transition;
  const dragBarHeight = DEFAULT_DRAG_BAR_HEIGHT;
  const { t, locale } = useI18n();
  useSettings();
  useReposQuery();
  useGitOkQuery();

  useEffect(() => {
    document.documentElement.dataset.platform = isMac ? "mac" : "other";
  }, [isMac]);

  useEffect(() => {
    if (!isMac) return;
    void api.setSettingsMenuLabel(t("settingsMenu")).catch(() => {
      /* menu sync is best-effort on non-mac builds */
    });
  }, [isMac, locale, t]);

  useEffect(() => {
    if (!isMac) return;
    let unlisten: (() => void) | undefined;
    listen("open-settings", () => {
      setSettingsOpen(true);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [isMac, setSettingsOpen]);

  useEffect(() => {
    if (!shouldAutoCheckForUpdate()) return;

    let cancelled = false;
    (async () => {
      markUpdateChecked();
      try {
        const update = await checkForAppUpdate();
        if (cancelled || !update) return;
        if (getDismissedUpdateVersion() === update.version) return;
        setAvailableUpdate(update);
      } catch {
        /* startup check is best-effort */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setAvailableUpdate]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<BatchProgress>("batch-progress", (event) => {
      queueProgress(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  return (
    <div
      className="flex h-svh flex-col overflow-hidden bg-background text-foreground"
      style={DRAG_BAR_OFFSET}
    >
      {dragBarHeight > 0 && (
        <div
          className="fixed top-0 left-0 right-0 z-[70] bg-background"
          data-tauri-drag-region
          style={
            {
              WebkitAppRegion: "drag",
              height: dragBarHeight,
            } as CSSProperties
          }
          aria-hidden="true"
        />
      )}
      {settingsOpen ? (
        <AppSettingsHeader
          dragBarHeight={dragBarHeight}
          onBack={() => setSettingsOpen(false)}
        />
      ) : detailRepo ? null : (
        <AppHeader dragBarHeight={dragBarHeight} />
      )}
      <AnimatePresence mode="wait" initial={false}>
        {settingsOpen ? (
          <motion.div
            key="settings"
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            style={PAGE_HEADER_INSET}
            initial={reduceMotion ? false : fadePage.initial}
            animate={fadePage.animate}
            exit={reduceMotion ? undefined : fadePage.exit}
            transition={pageTransition}
          >
            <Suspense fallback={null}>
              <SettingsPage onBack={() => setSettingsOpen(false)} />
            </Suspense>
          </motion.div>
        ) : detailRepo ? (
          <motion.div
            key={`workspace:${detailRepo.path}`}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            initial={reduceMotion ? false : fadePage.initial}
            animate={fadePage.animate}
            exit={reduceMotion ? undefined : fadePage.exit}
            transition={pageTransition}
          >
            <WorkspacePage repo={detailRepo} onBack={() => setDetailRepo(null)} />
          </motion.div>
        ) : (
          <motion.div
            key="home"
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            style={PAGE_HEADER_INSET}
            initial={reduceMotion ? false : fadePage.initial}
            animate={fadePage.animate}
            exit={reduceMotion ? undefined : fadePage.exit}
            transition={pageTransition}
          >
            <AppBanners />
            <AppMain />
          </motion.div>
        )}
      </AnimatePresence>
      <AppModals />
    </div>
  );
}

function AppSettingsHeader({
  dragBarHeight,
  onBack,
}: {
  dragBarHeight: number;
  onBack: () => void;
}) {
  const { t } = useI18n();

  return (
    <header
      className="app-header settings-page-header fixed z-50 w-full bg-background"
      {...DRAG_REGION_ATTR}
      style={
        {
          ...DRAG_REGION_STYLE,
          top: dragBarHeight,
          height: HEADER_HEIGHT,
        } as CSSProperties
      }
    >
      <div
        className="flex h-full items-center gap-3 px-6"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <button
          type="button"
          className="settings-back text-foreground transition-colors hover:bg-secondary"
          aria-label={t("gitInfoBack")}
          title={t("gitInfoBack")}
          onClick={onBack}
        >
          <ArrowLeftIcon className="size-4" />
        </button>
        <h1 className="truncate text-xl font-semibold tracking-tight">
          {t("settingsTitle")}
        </h1>
      </div>
    </header>
  );
}

/** Fleet actions wired to the shared selection / busy state in AppUiProvider. */
function useFleetActions() {
  const {
    selected,
    setSelected,
    setBusy,
    setRefreshing,
    clearProgress,
    setNotice,
    setError,
    setRemoteRenames,
  } = useAppUi();
  const { settings } = useSettings();
  return useRepoActions({
    scanDepth: settings.scanDepth,
    selected,
    setSelected,
    setBusy,
    setRefreshing,
    clearProgress,
    onNotice: setNotice,
    onError: setError,
    onRemoteRenames: setRemoteRenames,
  });
}

function AppHeader({ dragBarHeight }: { dragBarHeight: number }) {
  const { t } = useI18n();
  const {
    busy,
    refreshing,
    availableUpdate,
    updateInstalling,
    setSettingsOpen,
    setError,
    setUpdateInstalling,
    setUpdateProgress,
    setDetailRepo,
  } = useAppUi();
  const { data: gitOk = null } = useGitOkQuery();
  const [createMode, setCreateMode] = useState<"clone" | "init" | null>(null);
  const { data: repos = [] } = useReposQuery();
  const { onAdd, onScan, onRefresh, runBatch } = useFleetActions();

  const gitStatusLabel =
    gitOk === null ? t("gitChecking") : gitOk ? t("gitReady") : t("gitMissing");
  const locked = busy || gitOk === false;

  const installAvailableUpdate = async () => {
    if (!availableUpdate || updateInstalling) return;
    setUpdateInstalling(true);
    setUpdateProgress(0);
    setError(null);
    try {
      await downloadAndInstallUpdate(availableUpdate, ({ downloaded, contentLength }) => {
        const percent =
          contentLength && contentLength > 0
            ? Math.min(100, Math.round((downloaded / contentLength) * 100))
            : 0;
        setUpdateProgress(percent);
      });
      setUpdateProgress(null);
      await relaunchApp();
    } catch (e) {
      setUpdateInstalling(false);
      setUpdateProgress(null);
      const message = t("updateFailed", { error: formatUpdateError(e) });
      setError(message);
      toast.error(message);
    }
  };

  return (
    <header
      className="app-header fixed z-50 w-full bg-background"
      {...DRAG_REGION_ATTR}
      style={
        {
          ...DRAG_REGION_STYLE,
          top: dragBarHeight,
          height: HEADER_HEIGHT,
        } as CSSProperties
      }
    >
      <div
        className="flex h-full items-center justify-between gap-3 px-4"
        {...DRAG_REGION_ATTR}
        style={DRAG_REGION_STYLE as CSSProperties}
      >
        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <span className="app-wordmark">{APP_NAME}</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={gitStatusLabel}
                title={gitStatusLabel}
              >
                <span
                  className={cn(
                    "size-2 rounded-full",
                    gitOk === null && "bg-muted-foreground/40",
                    gitOk === true && "bg-[var(--ok)]",
                    gitOk === false && "bg-destructive",
                  )}
                  aria-hidden="true"
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64">
              <PopoverHeader>
                <PopoverTitle className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      gitOk === null && "bg-muted-foreground/40",
                      gitOk === true && "bg-[var(--ok)]",
                      gitOk === false && "bg-destructive",
                    )}
                    aria-hidden="true"
                  />
                  {gitStatusLabel}
                </PopoverTitle>
              </PopoverHeader>
              {gitOk === false && (
                <p className="text-sm text-muted-foreground">{t("gitMissingBanner")}</p>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <div
          className="flex shrink-0 items-center gap-1.5"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          {availableUpdate && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={updateInstalling}
              aria-label={t("updateAvailableBanner", {
                version: availableUpdate.version,
              })}
              title={t("updateAvailableBanner", {
                version: availableUpdate.version,
              })}
              className="text-[var(--ok)]"
              onClick={() => void installAvailableUpdate()}
            >
              <ArrowUpCircleIcon className="size-[18px]" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => void onRefresh()}
            disabled={locked || refreshing}
            aria-busy={refreshing}
            aria-label={refreshing ? t("refreshing") : undefined}
          >
            <RefreshCwIcon />
            {t("refresh")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              void runBatch(
                "fetch",
                repos.map((repo) => repo.path),
              )
            }
            disabled={locked || repos.length === 0}
          >
            <CloudDownloadIcon />
            {t("fetchAll")}
          </Button>
          <div className="flex items-center">
            <Button
              type="button"
              variant="outline"
              className="rounded-r-none"
              onClick={() => void onAdd()}
              disabled={locked}
            >
              <PlusIcon />
              {t("add")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="-ml-px rounded-l-none px-1.5"
                  aria-label={t("addMenu")}
                  disabled={locked}
                >
                  <ChevronDownIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => void onAdd()}>
                    {t("addRepo")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCreateMode("clone")}>
                    {t("clone")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCreateMode("init")}>
                    {t("initRepo")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void onScan()}>
                    {t("scanFolder")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("settings")}
            title={t("settings")}
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
          </Button>
        </div>
      </div>
      <CloneInitDialog
        mode={createMode}
        onOpenChange={(open) => {
          if (!open) setCreateMode(null);
        }}
        onAdded={(repo) => setDetailRepo(repo)}
      />
    </header>
  );
}

function AppBanners() {
  const { t } = useI18n();
  const {
    error,
    availableUpdate,
    updateInstalling,
    updateProgress,
    setAvailableUpdate,
    setUpdateInstalling,
    setUpdateProgress,
    setError,
  } = useAppUi();
  const { data: gitOk = null } = useGitOkQuery();

  const installAvailableUpdate = async () => {
    if (!availableUpdate || updateInstalling) return;
    setUpdateInstalling(true);
    setUpdateProgress(0);
    setError(null);
    try {
      await downloadAndInstallUpdate(availableUpdate, ({ downloaded, contentLength }) => {
        const percent =
          contentLength && contentLength > 0
            ? Math.min(100, Math.round((downloaded / contentLength) * 100))
            : 0;
        setUpdateProgress(percent);
      });
      setUpdateProgress(null);
      await relaunchApp();
    } catch (e) {
      setUpdateInstalling(false);
      setUpdateProgress(null);
      const message = t("updateFailed", { error: formatUpdateError(e) });
      setError(message);
      toast.error(message);
    }
  };

  const dismissAvailableUpdate = () => {
    if (availableUpdate) {
      dismissUpdateVersion(availableUpdate.version);
    }
    setAvailableUpdate(null);
  };

  if (!(error || gitOk === false || availableUpdate)) return null;

  return (
    <div className="app-banners flex flex-col">
      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}
      {gitOk === false && (
        <Alert>
          <CircleAlertIcon />
          <AlertDescription>{t("gitMissingBanner")}</AlertDescription>
        </Alert>
      )}
      {availableUpdate && (
        <Alert>
          <InfoIcon />
          <AlertTitle>
            {updateInstalling
              ? updateProgress == null
                ? t("installingUpdate")
                : t("downloadingUpdate", { percent: updateProgress })
              : t("updateAvailableBanner", {
                  version: availableUpdate.version,
                })}
          </AlertTitle>
          {updateInstalling && updateProgress != null && (
            <AlertDescription>
              <Progress value={updateProgress} className="mt-2" />
            </AlertDescription>
          )}
          {!updateInstalling && (
            <AlertAction className="static top-auto right-auto col-start-2 mt-2 flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void installAvailableUpdate()}
              >
                {t("downloadAndInstall")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={dismissAvailableUpdate}
              >
                {t("updateLater")}
              </Button>
            </AlertAction>
          )}
        </Alert>
      )}
    </div>
  );
}

function AppMain() {
  const { selected, busy, toggle, selectAll, clearSelection, setDetailRepo } = useAppUi();
  const { data: repos = [] } = useReposQuery();
  const { data: gitOk = null } = useGitOkQuery();
  const reorderMutation = useReorderReposMutation();
  const { onAdd, onScan, onRemoveSelected, runBatch } = useFleetActions();
  const locked = busy || gitOk === false;

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-background">
      <RepoList
        repos={repos}
        selected={selected}
        busy={locked}
        onToggle={toggle}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        onOpenDetail={setDetailRepo}
        onReorder={(paths) => {
          // Sync mutate so onMutate/setQueryData runs before drag teardown paint.
          reorderMutation.mutate(paths);
        }}
        onBatch={(mode, paths) => void runBatch(mode, paths)}
        onAdd={() => void onAdd()}
        onScan={() => void onScan()}
      />
      <BatchBar
        busy={locked}
        selectedCount={selected.size}
        totalCount={repos.length}
        onClearSelection={clearSelection}
        onFetch={() => void runBatch("fetch")}
        onUpdate={() => void runBatch("update")}
        onRemoveSelected={() => void onRemoveSelected()}
      />
    </main>
  );
}

function AppModals() {
  const { remoteRenames, setRemoteRenames } = useAppUi();

  return (
    <RemoteRenameDialog renames={remoteRenames} onDone={() => setRemoteRenames([])} />
  );
}

export default App;
