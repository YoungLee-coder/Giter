import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import type { Update } from "@tauri-apps/plugin-updater";
import { clearProgressQueue } from "@/lib/progressBus";
import {
  api,
  type BatchProgress,
  type RemovedRepo,
  type RepoStatus,
} from "@/lib/tauri";
import {
  dismissUpdateVersion,
  downloadAndInstallUpdate,
  formatUpdateError,
  relaunchApp,
} from "@/lib/updater";
import { useI18nStore } from "@/stores/i18nStore";
import { useSettingsStore } from "@/stores/settingsStore";

function detectIsMac(): boolean {
  return (
    /Mac|iPhone|iPod|iPad/i.test(navigator.platform) ||
    navigator.userAgent.includes("Mac")
  );
}

function mergeRepoStatuses(
  repos: RepoStatus[],
  updates: RepoStatus[],
  removedPaths?: Set<string>,
): RepoStatus[] {
  const map = new Map(updates.map((r) => [r.path, r]));
  const base = removedPaths
    ? repos.filter((r) => !removedPaths.has(r.path))
    : repos;
  return base.map((r) => map.get(r.path) ?? r);
}

export type AppState = {
  repos: RepoStatus[];
  selected: Set<string>;
  progress: Record<string, BatchProgress>;
  busy: boolean;
  refreshing: boolean;
  gitOk: boolean | null;
  error: string | null;
  notice: string | null;
  settingsOpen: boolean;
  detailRepo: RepoStatus | null;
  availableUpdate: Update | null;
  updateInstalling: boolean;
  updateProgress: number | null;
  isMac: boolean;

  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
  setProgress: (
    progress:
      | Record<string, BatchProgress>
      | ((prev: Record<string, BatchProgress>) => Record<string, BatchProgress>),
  ) => void;
  clearProgress: () => void;
  setGitOk: (gitOk: boolean | null) => void;
  setSettingsOpen: (open: boolean) => void;
  setDetailRepo: (repo: RepoStatus | null) => void;
  setAvailableUpdate: (update: Update | null) => void;
  applyRemovedNotice: (removed: RemovedRepo[]) => void;
  load: () => Promise<void>;
  toggle: (path: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  onReorder: (paths: string[]) => Promise<void>;
  onAdd: () => Promise<void>;
  onScan: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onRemoveSelected: () => Promise<void>;
  runBatch: (mode: "fetch" | "update") => Promise<void>;
  installAvailableUpdate: () => Promise<void>;
  dismissAvailableUpdate: () => void;
};

export const useAppStore = create<AppState>((set, get) => ({
  repos: [],
  selected: new Set(),
  progress: {},
  busy: false,
  refreshing: false,
  gitOk: null,
  error: null,
  notice: null,
  settingsOpen: false,
  detailRepo: null,
  availableUpdate: null,
  updateInstalling: false,
  updateProgress: null,
  isMac: detectIsMac(),

  setError: (error) => set({ error }),
  setNotice: (notice) => set({ notice }),
  setProgress: (progress) =>
    set((state) => ({
      progress: typeof progress === "function" ? progress(state.progress) : progress,
    })),
  clearProgress: () => {
    clearProgressQueue();
    set({ progress: {} });
  },
  setGitOk: (gitOk) => set({ gitOk }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setDetailRepo: (detailRepo) => set({ detailRepo }),
  setAvailableUpdate: (availableUpdate) => set({ availableUpdate }),

  applyRemovedNotice: (removed) => {
    if (removed.length === 0) {
      set({ notice: null });
      return;
    }
    const { locale, t } = useI18nStore.getState();
    const sep = locale === "zh-CN" ? "、" : ", ";
    set((state) => {
      const next = new Set(state.selected);
      for (const r of removed) next.delete(r.path);
      return {
        notice: t("removedInvalid", {
          names: removed.map((r) => r.name).join(sep),
        }),
        selected: next,
      };
    });
  },

  load: async () => {
    set({ error: null });
    try {
      const [gitOk, list] = await Promise.all([
        api.checkGit().catch(() => false),
        api.listRepos(),
      ]);
      set({ gitOk, repos: list });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  toggle: (path) => {
    set((state) => {
      const next = new Set(state.selected);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { selected: next };
    });
  },

  selectAll: () => {
    set((state) => ({
      selected: new Set(state.repos.map((r) => r.path)),
    }));
  },

  clearSelection: () => set({ selected: new Set() }),

  onReorder: async (paths) => {
    const { repos } = get();
    const byPath = new Map(repos.map((r) => [r.path, r]));
    const previous = repos;
    const next = paths
      .map((path) => byPath.get(path))
      .filter((r): r is RepoStatus => r != null);
    if (next.length !== previous.length) return;
    set({ repos: next });
    try {
      await api.reorderRepos(paths);
    } catch (e) {
      set({ repos: previous, error: String(e) });
    }
  },

  onAdd: async () => {
    const path = await open({ directory: true, multiple: false });
    if (!path || Array.isArray(path)) return;
    set({ busy: true, error: null });
    try {
      const status = await api.addRepo(path);
      set((state) => {
        const existing = state.repos.findIndex((r) => r.path === status.path);
        const repos =
          existing >= 0
            ? state.repos.map((r, i) => (i === existing ? status : r))
            : [...state.repos, status];
        const selected = new Set(state.selected);
        selected.add(status.path);
        return { repos, selected };
      });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ busy: false });
    }
  },

  onScan: async () => {
    const path = await open({ directory: true, multiple: false });
    if (!path || Array.isArray(path)) return;
    set({ busy: true, error: null });
    try {
      const { scanDepth } = useSettingsStore.getState().settings;
      const added = await api.scanFolder(path, scanDepth);
      if (added.length === 0) {
        await get().load();
        return;
      }
      set((state) => {
        const existing = new Set(state.repos.map((r) => r.path));
        const repos = [
          ...state.repos,
          ...added.filter((r) => !existing.has(r.path)),
        ];
        return { repos };
      });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ busy: false });
    }
  },

  onRefresh: async () => {
    const { busy, refreshing } = get();
    if (busy || refreshing) return;
    get().clearProgress();
    set({ refreshing: true, busy: true, error: null });
    try {
      const result = await api.refreshStatus();
      set({ repos: result.repos });
      get().applyRemovedNotice(result.removed);
    } catch (e) {
      set({ error: String(e) });
    } finally {
      get().clearProgress();
      set({ busy: false, refreshing: false });
    }
  },

  onRemoveSelected: async () => {
    const paths = Array.from(get().selected);
    if (paths.length === 0) return;
    set({ busy: true, error: null });
    try {
      await api.removeRepos(paths);
      const removed = new Set(paths);
      set((state) => ({
        repos: state.repos.filter((r) => !removed.has(r.path)),
        selected: new Set(),
      }));
    } catch (e) {
      set({ error: String(e) });
      await get().load();
    } finally {
      set({ busy: false });
    }
  },

  runBatch: async (mode) => {
    const paths = Array.from(get().selected);
    if (paths.length === 0) return;
    get().clearProgress();
    set({ busy: true, error: null });
    try {
      const updated =
        mode === "fetch"
          ? await api.batchFetch(paths)
          : await api.batchUpdate(paths);
      set((state) => ({
        repos: mergeRepoStatuses(state.repos, updated),
      }));
    } catch (e) {
      set({ error: String(e) });
    } finally {
      get().clearProgress();
      set({ busy: false });
    }
  },

  installAvailableUpdate: async () => {
    const { availableUpdate, updateInstalling } = get();
    if (!availableUpdate || updateInstalling) return;
    set({ updateInstalling: true, updateProgress: 0, error: null });
    try {
      await downloadAndInstallUpdate(
        availableUpdate,
        ({ downloaded, contentLength }) => {
          const percent =
            contentLength && contentLength > 0
              ? Math.min(100, Math.round((downloaded / contentLength) * 100))
              : 0;
          set({ updateProgress: percent });
        },
      );
      set({ updateProgress: null });
      await relaunchApp();
    } catch (e) {
      const { t } = useI18nStore.getState();
      set({
        updateInstalling: false,
        updateProgress: null,
        error: t("updateFailed", { error: formatUpdateError(e) }),
      });
    }
  },

  dismissAvailableUpdate: () => {
    const { availableUpdate } = get();
    if (availableUpdate) {
      dismissUpdateVersion(availableUpdate.version);
    }
    set({ availableUpdate: null });
  },
}));
