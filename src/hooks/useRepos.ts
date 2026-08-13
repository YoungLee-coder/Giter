import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import i18n from "@/i18n";
import { queryKeys } from "@/lib/query/keys";
import { api, type RemovedRepo, type RepoStatus } from "@/lib/tauri";
import { clearProgressQueue } from "@/lib/progressBus";

function mergeRepoStatuses(
  repos: RepoStatus[],
  updates: RepoStatus[],
  removedPaths?: Set<string>,
): RepoStatus[] {
  const map = new Map(updates.map((r) => [r.path, r]));
  const base = removedPaths ? repos.filter((r) => !removedPaths.has(r.path)) : repos;
  return base.map((r) => map.get(r.path) ?? r);
}

function removedNotice(removed: RemovedRepo[]): string | null {
  if (removed.length === 0) return null;
  const locale = i18n.language;
  const sep = locale === "zh-CN" ? "、" : ", ";
  return i18n.t("removedInvalid", {
    names: removed.map((r) => r.name).join(sep),
  });
}

export function useReposQuery() {
  return useQuery({
    queryKey: queryKeys.repos,
    queryFn: () => api.listRepos(),
  });
}

export function useGitOkQuery() {
  return useQuery({
    queryKey: queryKeys.gitOk,
    queryFn: () => api.checkGit().catch(() => false),
  });
}

export function useReorderReposMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) => api.reorderRepos(paths),
    // Keep onMutate fully sync: any `await` before setQueryData lets React
    // paint the pre-drag order once transforms clear (visible drop flicker).
    onMutate: (paths) => {
      void queryClient.cancelQueries({ queryKey: queryKeys.repos });
      const previous = queryClient.getQueryData<RepoStatus[]>(queryKeys.repos) ?? [];
      const byPath = new Map(previous.map((r) => [r.path, r]));
      const next = paths
        .map((path) => byPath.get(path))
        .filter((r): r is RepoStatus => r != null);
      if (next.length === previous.length) {
        queryClient.setQueryData(queryKeys.repos, next);
      }
      return { previous };
    },
    onError: (error, _paths, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.repos, context.previous);
      }
      toast.error(i18n.t("sortUpdateFailed"));
      console.error(error);
    },
    onSuccess: () => {
      toast.success(i18n.t("sortUpdated"), { closeButton: true });
    },
  });
}

export function useRepoActions(options: {
  scanDepth: number;
  selected: Set<string>;
  setSelected: (next: Set<string>) => void;
  setBusy: (busy: boolean) => void;
  setRefreshing: (refreshing: boolean) => void;
  clearProgress: () => void;
  onNotice?: (notice: string | null) => void;
  onError?: (error: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const {
    scanDepth,
    selected,
    setSelected,
    setBusy,
    setRefreshing,
    clearProgress,
    onNotice,
    onError,
  } = options;

  const invalidateRepos = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.repos });

  const setRepos = (repos: RepoStatus[]) => {
    queryClient.setQueryData(queryKeys.repos, repos);
  };

  const getRepos = () => queryClient.getQueryData<RepoStatus[]>(queryKeys.repos) ?? [];

  const onAdd = async () => {
    const path = await open({ directory: true, multiple: false });
    if (!path || Array.isArray(path)) return;
    setBusy(true);
    onError?.(null);
    try {
      const status = await api.addRepo(path);
      const repos = getRepos();
      const existing = repos.findIndex((r) => r.path === status.path);
      const next =
        existing >= 0
          ? repos.map((r, i) => (i === existing ? status : r))
          : [...repos, status];
      setRepos(next);
      const nextSelected = new Set(selected);
      nextSelected.add(status.path);
      setSelected(nextSelected);
    } catch (e) {
      onError?.(String(e));
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onScan = async () => {
    const path = await open({ directory: true, multiple: false });
    if (!path || Array.isArray(path)) return;
    setBusy(true);
    onError?.(null);
    try {
      const added = await api.scanFolder(path, scanDepth);
      if (added.length === 0) {
        await invalidateRepos();
        return;
      }
      const repos = getRepos();
      const existing = new Set(repos.map((r) => r.path));
      setRepos([...repos, ...added.filter((r) => !existing.has(r.path))]);
    } catch (e) {
      onError?.(String(e));
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onRefresh = async () => {
    clearProgress();
    setRefreshing(true);
    setBusy(true);
    onError?.(null);
    try {
      const result = await api.refreshStatus();
      setRepos(result.repos);
      const notice = removedNotice(result.removed);
      onNotice?.(notice);
      if (notice) toast(notice);
      setSelected(new Set());
    } catch (e) {
      onError?.(String(e));
      toast.error(String(e));
    } finally {
      clearProgress();
      clearProgressQueue();
      setBusy(false);
      setRefreshing(false);
    }
  };

  const onRemoveSelected = async () => {
    const paths = Array.from(selected);
    if (paths.length === 0) return;
    setBusy(true);
    onError?.(null);
    try {
      await api.removeRepos(paths);
      const removed = new Set(paths);
      setRepos(getRepos().filter((r) => !removed.has(r.path)));
      setSelected(new Set());
    } catch (e) {
      onError?.(String(e));
      toast.error(String(e));
      await invalidateRepos();
    } finally {
      setBusy(false);
    }
  };

  const runBatch = async (mode: "fetch" | "update") => {
    const paths = Array.from(selected);
    if (paths.length === 0) return;
    clearProgress();
    setBusy(true);
    onError?.(null);
    try {
      const updated =
        mode === "fetch" ? await api.batchFetch(paths) : await api.batchUpdate(paths);
      setRepos(mergeRepoStatuses(getRepos(), updated));
      setSelected(new Set());
    } catch (e) {
      onError?.(String(e));
      toast.error(String(e));
    } finally {
      clearProgress();
      clearProgressQueue();
      setBusy(false);
    }
  };

  return {
    onAdd,
    onScan,
    onRefresh,
    onRemoveSelected,
    runBatch,
    invalidateRepos,
  };
}
