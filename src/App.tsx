import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { BatchBar, RepoGrid } from "./components/RepoUI";
import { RepoDetailModal } from "./components/RepoDetailModal";
import { SettingsIcon, SettingsModal } from "./components/SettingsModal";
import { useI18n } from "./i18n";
import {
  api,
  type BatchProgress,
  type RemovedRepo,
  type RepoStatus,
} from "./lib/tauri";
import { useSettings } from "./settings";
import "./App.css";

function App() {
  const { t, locale } = useI18n();
  const { settings } = useSettings();
  const [repos, setRepos] = useState<RepoStatus[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, BatchProgress>>({});
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [gitOk, setGitOk] = useState<boolean | null>(null);
  const [gitStatusOpen, setGitStatusOpen] = useState(false);
  const gitStatusRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailRepo, setDetailRepo] = useState<RepoStatus | null>(null);
  const [isMac] = useState(() => {
    return (
      /Mac|iPhone|iPod|iPad/i.test(navigator.platform) ||
      navigator.userAgent.includes("Mac")
    );
  });

  const gitStatusLabel =
    gitOk === null
      ? t("gitChecking")
      : gitOk
        ? t("gitReady")
        : t("gitMissing");

  const applyRemovedNotice = useCallback(
    (removed: RemovedRepo[]) => {
      if (removed.length === 0) {
        setNotice(null);
        return;
      }
      const sep = locale === "zh-CN" ? "、" : ", ";
      setNotice(
        t("removedInvalid", {
          names: removed.map((r) => r.name).join(sep),
        }),
      );
      setSelected((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const r of removed) next.delete(r.path);
        return next;
      });
    },
    [locale, t],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await api.listRepos();
      setRepos(list);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.platform = isMac ? "mac" : "other";
  }, [isMac]);

  useEffect(() => {
    if (!gitStatusOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!gitStatusRef.current?.contains(event.target as Node)) {
        setGitStatusOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGitStatusOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [gitStatusOpen]);

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
  }, [isMac]);

  useEffect(() => {
    (async () => {
      try {
        setGitOk(await api.checkGit());
      } catch {
        setGitOk(false);
      }
      await load();
    })();
  }, [load]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<BatchProgress>("batch-progress", (event) => {
      const p = event.payload;
      setProgress((prev) => ({ ...prev, [p.path]: p }));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const onAdd = async () => {
    const path = await open({ directory: true, multiple: false });
    if (!path || Array.isArray(path)) return;
    setBusy(true);
    setError(null);
    try {
      const status = await api.addRepo(path);
      setRepos((prev) => {
        const others = prev.filter((r) => r.path !== status.path);
        return [...others, status].sort((a, b) => a.name.localeCompare(b.name));
      });
      setSelected((prev) => new Set(prev).add(status.path));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onScan = async () => {
    const path = await open({ directory: true, multiple: false });
    if (!path || Array.isArray(path)) return;
    setBusy(true);
    setError(null);
    try {
      await api.scanFolder(path, settings.scanDepth);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onRefresh = async () => {
    if (busy || refreshing) return;
    setRefreshing(true);
    setBusy(true);
    setError(null);
    setProgress({});
    const startedAt = Date.now();
    try {
      const result = await api.refreshStatus();
      setRepos(result.repos);
      applyRemovedNotice(result.removed);
    } catch (e) {
      setError(String(e));
    } finally {
      const elapsed = Date.now() - startedAt;
      const remain = 700 - elapsed;
      if (remain > 0) {
        await new Promise((resolve) => setTimeout(resolve, remain));
      }
      setProgress({});
      setBusy(false);
      setRefreshing(false);
    }
  };

  const onRemoveSelected = async () => {
    const paths = Array.from(selected);
    if (paths.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const path of paths) {
        await api.removeRepo(path);
      }
      const removed = new Set(paths);
      setRepos((prev) => prev.filter((r) => !removed.has(r.path)));
      setSelected(new Set());
    } catch (e) {
      setError(String(e));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const runBatch = async (mode: "fetch" | "update") => {
    const paths = Array.from(selected);
    if (paths.length === 0) return;
    setBusy(true);
    setError(null);
    setProgress({});
    try {
      if (mode === "fetch") await api.batchFetch(paths);
      else await api.batchUpdate(paths);
      const result = await api.refreshStatus(paths);
      const removedPaths = new Set(result.removed.map((r) => r.path));
      const map = new Map(result.repos.map((r) => [r.path, r]));
      setRepos((prev) =>
        prev
          .filter((r) => !removedPaths.has(r.path))
          .map((r) => map.get(r.path) ?? r),
      );
      applyRemovedNotice(result.removed);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const gitClass =
    gitOk === null ? "" : gitOk ? "is-ok" : "is-bad";

  return (
    <div className="app">
      <header className="toolbar" data-tauri-drag-region>
        <div className="toolbar__groups" data-tauri-drag-region>
          <BatchBar
            busy={busy || gitOk === false}
            refreshing={refreshing}
            selectedCount={selected.size}
            totalCount={repos.length}
            onAdd={onAdd}
            onScan={onScan}
            onRefresh={onRefresh}
            onFetch={() => runBatch("fetch")}
            onUpdate={() => runBatch("update")}
            onRemoveSelected={onRemoveSelected}
          />
        </div>
        <div className="toolbar__meta" data-tauri-drag-region>
          <div className="git-status-wrap" ref={gitStatusRef}>
            <button
              type="button"
              className={`git-status ${gitClass}`}
              aria-label={gitStatusLabel}
              aria-expanded={gitStatusOpen}
              aria-haspopup="dialog"
              onClick={() => setGitStatusOpen((open) => !open)}
            >
              <span className="git-status__dot" aria-hidden="true" />
            </button>
            {gitStatusOpen && (
              <div className="git-status-popover" role="dialog" aria-label={gitStatusLabel}>
                <div className="git-status-popover__row">
                  <span className={`git-status__dot ${gitClass}`} aria-hidden="true" />
                  <span className="git-status-popover__title">{gitStatusLabel}</span>
                </div>
                {gitOk === false && (
                  <p className="git-status-popover__hint">{t("gitMissingBanner")}</p>
                )}
              </div>
            )}
          </div>
          {!isMac && (
            <button
              type="button"
              className="icon-btn ghost"
              aria-label={t("settings")}
              title={t("settings")}
              onClick={() => setSettingsOpen(true)}
            >
              <SettingsIcon />
            </button>
          )}
        </div>
      </header>

      {(error || notice || gitOk === false) && (
        <div className="banners">
          {error && <div className="banner err">{error}</div>}
          {notice && <div className="banner info">{notice}</div>}
          {gitOk === false && (
            <div className="banner warn">{t("gitMissingBanner")}</div>
          )}
        </div>
      )}

      <main className="content">
        <RepoGrid
          repos={repos}
          selected={selected}
          progress={progress}
          onToggle={toggle}
          onSelectAll={() => setSelected(new Set(repos.map((r) => r.path)))}
          onClearSelection={() => setSelected(new Set())}
          onOpenDetail={setDetailRepo}
        />
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <RepoDetailModal repo={detailRepo} onClose={() => setDetailRepo(null)} />
    </div>
  );
}

export default App;
