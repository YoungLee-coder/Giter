import { lazy, Suspense, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { AlertCircleIcon, CircleAlertIcon, InfoIcon, SettingsIcon } from "lucide-react";
import { BatchBar, RepoGrid } from "@/components/repo";
import { RepoDetailModal } from "@/components/RepoDetailModal";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/i18n";
import { queueProgress } from "@/lib/progressBus";
import { api, type BatchProgress } from "@/lib/tauri";
import {
  checkForAppUpdate,
  getDismissedUpdateVersion,
  markUpdateChecked,
  shouldAutoCheckForUpdate,
} from "@/lib/updater";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/appStore";
import "./App.css";

const SettingsModal = lazy(() =>
  import("@/components/SettingsModal").then((m) => ({ default: m.SettingsModal })),
);

function App() {
  const isMac = useAppStore((s) => s.isMac);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setAvailableUpdate = useAppStore((s) => s.setAvailableUpdate);
  const load = useAppStore((s) => s.load);
  const { t, locale } = useI18n();

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
    void load();
  }, [load]);

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
    <div className="flex h-svh flex-col bg-background text-foreground">
      <AppToolbar />
      <AppBanners />
      <AppMain />
      <AppModals />
    </div>
  );
}

function AppToolbar() {
  const { t } = useI18n();
  const repos = useAppStore((s) => s.repos);
  const selected = useAppStore((s) => s.selected);
  const busy = useAppStore((s) => s.busy);
  const refreshing = useAppStore((s) => s.refreshing);
  const gitOk = useAppStore((s) => s.gitOk);
  const isMac = useAppStore((s) => s.isMac);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const onAdd = useAppStore((s) => s.onAdd);
  const onScan = useAppStore((s) => s.onScan);
  const onRefresh = useAppStore((s) => s.onRefresh);
  const onRemoveSelected = useAppStore((s) => s.onRemoveSelected);
  const runBatch = useAppStore((s) => s.runBatch);

  const gitStatusLabel =
    gitOk === null
      ? t("gitChecking")
      : gitOk
        ? t("gitReady")
        : t("gitMissing");

  return (
    <header
      className="app-toolbar flex h-12 shrink-0 items-stretch gap-3 border-b px-3"
      data-tauri-drag-region
    >
      <div className="flex min-w-0 flex-1 items-stretch" data-tauri-drag-region>
        <BatchBar
          busy={busy || gitOk === false}
          refreshing={refreshing}
          selectedCount={selected.size}
          totalCount={repos.length}
          onAdd={() => void onAdd()}
          onScan={() => void onScan()}
          onRefresh={() => void onRefresh()}
          onFetch={() => void runBatch("fetch")}
          onUpdate={() => void runBatch("update")}
          onRemoveSelected={() => void onRemoveSelected()}
        />
      </div>
      <div className="flex items-center gap-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={gitStatusLabel}
              className="relative"
            >
              <span
                className={cn(
                  "size-2.5 rounded-full",
                  gitOk === null && "bg-muted-foreground/40",
                  gitOk === true && "bg-[var(--ok)]",
                  gitOk === false && "bg-destructive",
                )}
                aria-hidden="true"
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <PopoverHeader>
              <PopoverTitle className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-2.5 rounded-full",
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
              <p className="text-sm text-muted-foreground">
                {t("gitMissingBanner")}
              </p>
            )}
          </PopoverContent>
        </Popover>
        {!isMac && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("settings")}
            title={t("settings")}
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
          </Button>
        )}
      </div>
    </header>
  );
}

function AppBanners() {
  const { t } = useI18n();
  const error = useAppStore((s) => s.error);
  const notice = useAppStore((s) => s.notice);
  const gitOk = useAppStore((s) => s.gitOk);
  const availableUpdate = useAppStore((s) => s.availableUpdate);
  const updateInstalling = useAppStore((s) => s.updateInstalling);
  const updateProgress = useAppStore((s) => s.updateProgress);
  const installAvailableUpdate = useAppStore((s) => s.installAvailableUpdate);
  const dismissAvailableUpdate = useAppStore((s) => s.dismissAvailableUpdate);

  if (!(error || notice || gitOk === false || availableUpdate)) return null;

  return (
    <div className="app-banners flex flex-col">
      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}
      {notice && (
        <Alert>
          <InfoIcon />
          <AlertDescription>{notice}</AlertDescription>
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
  const repos = useAppStore((s) => s.repos);
  const selected = useAppStore((s) => s.selected);
  const toggle = useAppStore((s) => s.toggle);
  const selectAll = useAppStore((s) => s.selectAll);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const setDetailRepo = useAppStore((s) => s.setDetailRepo);
  const onReorder = useAppStore((s) => s.onReorder);

  return (
    <main className="giter-scroll min-h-0 flex-1 overflow-auto bg-background p-2.5">
      <RepoGrid
        repos={repos}
        selected={selected}
        onToggle={toggle}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        onOpenDetail={setDetailRepo}
        onReorder={onReorder}
      />
    </main>
  );
}

function AppModals() {
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const detailRepo = useAppStore((s) => s.detailRepo);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setDetailRepo = useAppStore((s) => s.setDetailRepo);

  return (
    <>
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal open onClose={() => setSettingsOpen(false)} />
        </Suspense>
      )}
      {detailRepo && (
        <RepoDetailModal
          repo={detailRepo}
          onClose={() => setDetailRepo(null)}
        />
      )}
    </>
  );
}

export default App;
