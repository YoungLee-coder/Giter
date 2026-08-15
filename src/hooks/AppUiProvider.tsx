import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import type { BatchProgress, RemoteRename, RepoStatus } from "@/lib/tauri";
import { clearProgressQueue } from "@/lib/progressBus";
import { setProgressWriter } from "@/lib/progressWriter";

function detectIsMac(): boolean {
  return (
    /Mac|iPhone|iPod|iPad/i.test(navigator.platform) ||
    navigator.userAgent.includes("Mac")
  );
}

type AppUiContextValue = {
  selected: Set<string>;
  progress: Record<string, BatchProgress>;
  busy: boolean;
  refreshing: boolean;
  error: string | null;
  notice: string | null;
  settingsOpen: boolean;
  detailRepo: RepoStatus | null;
  remoteRenames: RemoteRename[];
  availableUpdate: Update | null;
  updateInstalling: boolean;
  updateProgress: number | null;
  isMac: boolean;
  setSelected: (next: Set<string>) => void;
  toggle: (path: string) => void;
  selectAll: (paths: string[]) => void;
  clearSelection: () => void;
  setProgress: (
    progress:
      | Record<string, BatchProgress>
      | ((prev: Record<string, BatchProgress>) => Record<string, BatchProgress>),
  ) => void;
  clearProgress: () => void;
  setBusy: (busy: boolean) => void;
  setRefreshing: (refreshing: boolean) => void;
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
  setSettingsOpen: (open: boolean) => void;
  setDetailRepo: (repo: RepoStatus | null) => void;
  setRemoteRenames: (renames: RemoteRename[]) => void;
  setAvailableUpdate: (update: Update | null) => void;
  setUpdateInstalling: (value: boolean) => void;
  setUpdateProgress: (value: number | null) => void;
};

const AppUiContext = createContext<AppUiContextValue | null>(null);

export function AppUiProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [progress, setProgressState] = useState<Record<string, BatchProgress>>({});
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailRepo, setDetailRepo] = useState<RepoStatus | null>(null);
  const [remoteRenames, setRemoteRenames] = useState<RemoteRename[]>([]);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const isMac = useMemo(() => detectIsMac(), []);

  const setProgress = useCallback(
    (
      next:
        | Record<string, BatchProgress>
        | ((prev: Record<string, BatchProgress>) => Record<string, BatchProgress>),
    ) => {
      setProgressState((prev) => (typeof next === "function" ? next(prev) : next));
    },
    [],
  );

  useEffect(() => {
    setProgressWriter(setProgress);
    return () => setProgressWriter(null);
  }, [setProgress]);

  const clearProgress = useCallback(() => {
    clearProgressQueue();
    setProgressState({});
  }, []);

  const toggle = useCallback((path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const selectAll = useCallback((paths: string[]) => {
    setSelected(new Set(paths));
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const value = useMemo<AppUiContextValue>(
    () => ({
      selected,
      progress,
      busy,
      refreshing,
      error,
      notice,
      settingsOpen,
      detailRepo,
      remoteRenames,
      availableUpdate,
      updateInstalling,
      updateProgress,
      isMac,
      setSelected,
      toggle,
      selectAll,
      clearSelection,
      setProgress,
      clearProgress,
      setBusy,
      setRefreshing,
      setError,
      setNotice,
      setSettingsOpen,
      setDetailRepo,
      setRemoteRenames,
      setAvailableUpdate,
      setUpdateInstalling,
      setUpdateProgress,
    }),
    [
      selected,
      progress,
      busy,
      refreshing,
      error,
      notice,
      settingsOpen,
      detailRepo,
      remoteRenames,
      availableUpdate,
      updateInstalling,
      updateProgress,
      isMac,
      toggle,
      selectAll,
      clearSelection,
      setProgress,
      clearProgress,
    ],
  );

  return <AppUiContext.Provider value={value}>{children}</AppUiContext.Provider>;
}

export function useAppUi() {
  const ctx = useContext(AppUiContext);
  if (!ctx) throw new Error("useAppUi must be used within AppUiProvider");
  return ctx;
}
