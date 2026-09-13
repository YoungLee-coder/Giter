import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  ArrowDownToLineIcon,
  ArrowLeftIcon,
  ArrowUpFromLineIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CheckIcon,
  CircleAlertIcon,
  EllipsisIcon,
  FolderOpenIcon,
  GitBranchIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/hooks/useI18n";
import { DRAG_REGION_ATTR } from "@/lib/platform";
import { queryKeys } from "@/lib/query/keys";
import {
  api,
  type BlameLine,
  type CommitInfo,
  type DiffHunk,
  type FileDiff,
  type HunkLineInput,
  type RepoStatus,
  type WorkspaceSnapshot,
} from "@/lib/tauri";
import { BranchesPanel } from "./BranchesPanel";
import { ChangesPanel } from "./ChangesPanel";
import { CommitBar } from "./CommitBar";
import { ConfirmDialog } from "./ConfirmDialog";
import { HistoryPanel } from "./HistoryPanel";

type Tab = "changes" | "branches" | "history";
type SelectedFile = { path: string; staged: boolean } | null;

type ConfirmState =
  | { kind: "discard"; path: string }
  | { kind: "discard-all"; paths: string[] }
  | { kind: "delete-branch"; name: string }
  | { kind: "merge"; name: string }
  | { kind: "rebase"; name: string }
  | { kind: "force-push" }
  | { kind: "reset"; hash: string; mode: "soft" | "mixed" | "hard" }
  | null;

type Props = {
  repo: RepoStatus;
  onBack: () => void;
};

const TABS: Tab[] = ["changes", "branches", "history"];

/**
 * Force push is hidden from the UI for now. The confirm flow, the
 * `api.pushRepo(path, true)` call and the i18n copy are kept on purpose, so
 * flipping this back to `true` restores the ⋯ menu (show in folder + force push)
 * exactly as it was.
 */
const SHOW_FORCE_PUSH: boolean = false;

export function WorkspacePage({ repo, onBack }: Props) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const path = repo.path;
  const [tab, setTab] = useState<Tab>("changes");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const [selectedFile, setSelectedFile] = useState<SelectedFile>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [search, setSearch] = useState("");
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);
  const [blame, setBlame] = useState<BlameLine[] | null>(null);
  const [fileHistory, setFileHistory] = useState<CommitInfo[] | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const snapshotQuery = useQuery({
    queryKey: queryKeys.workspace(path),
    queryFn: () => api.workspaceSnapshot(path),
    refetchInterval: 4000,
  });
  /**
   * Branches/tags/stashes are only rendered by the branches tab, but they are
   * fetched as soon as the snapshot is in rather than on first tab open, so
   * switching tabs is instant. On the Rust side `repo_refs` shares the per-repo
   * lock with `workspace_snapshot`; that lock queues instead of failing, so the
   * two commands still run one after the other without a retry backoff.
   * `refetchOnMount: false` avoids a redundant fetch on every remount, and the
   * effect below refreshes the data whenever the snapshot does, so branch data
   * follows external `git` changes without its own polling timer.
   */
  const refsQuery = useQuery({
    queryKey: queryKeys.repoRefs(path),
    queryFn: () => api.repoRefs(path),
    enabled: snapshotQuery.data != null,
    refetchOnMount: false,
  });

  const snapshot = snapshotQuery.data;
  const { refetch: refetchRefs } = refsQuery;
  useEffect(() => {
    if (snapshot == null) return;
    void refetchRefs();
  }, [snapshot, refetchRefs]);

  const status = snapshot?.status ?? repo;
  const files = snapshot?.files ?? [];
  const localBranchCount = (refsQuery.data?.branches ?? []).filter(
    (branch) => !branch.remote,
  ).length;
  const stagedCount = files.filter((file) => file.staged).length;
  const unstagedCount = files.filter(
    (file) => file.unstaged || file.kind === "untracked",
  ).length;

  const syncStatus = useCallback(
    (next: WorkspaceSnapshot) => {
      queryClient.setQueryData(queryKeys.workspace(path), next);
      queryClient.setQueryData<RepoStatus[]>(queryKeys.repos, (prev) =>
        prev?.map((item) => (item.path === next.status.path ? next.status : item)),
      );
      // The refs effect above reacts to the snapshot update (branch lists can
      // change after checkout/merge/rebase/stash), so no direct refetch here.
    },
    [path, queryClient],
  );

  const run = useCallback(
    async (work: () => Promise<WorkspaceSnapshot>, ok?: string) => {
      setBusy(true);
      setError(null);
      try {
        const next = await work();
        syncStatus(next);
        if (ok) toast.success(ok);
        return next;
      } catch (e) {
        const text = String(e);
        setError(text);
        toast.error(text);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [syncStatus],
  );

  const loadDiff = useCallback(
    async (file: SelectedFile) => {
      if (!file) {
        setDiff(null);
        return;
      }
      try {
        setDiff(await api.fileDiff(path, file.path, file.staged));
      } catch (e) {
        setDiff(null);
        setError(String(e));
      }
    },
    [path],
  );

  useEffect(() => {
    void loadDiff(selectedFile);
  }, [loadDiff, selectedFile, snapshot?.files]);

  const loadCommits = useCallback(
    async (reset: boolean, query = search) => {
      const skip = reset ? 0 : commits.length;
      const page = await api.commitsPage(path, skip, 50, query || undefined);
      setCommits(reset ? page : [...commits, ...page]);
      setHasMore(page.length === 50);
    },
    [commits.length, path, search],
  );

  useEffect(() => {
    if (tab !== "history") return;
    void loadCommits(true).catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when opening history or changing repo
  }, [tab, path]);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en", {
        month: "short",
        day: "numeric",
      }),
    [locale],
  );
  const formatDate = useCallback(
    (iso: string) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
    },
    [dateFmt],
  );

  const opLabel =
    snapshot?.operation === "merge"
      ? t("workspaceOpMerge")
      : snapshot?.operation === "rebase"
        ? t("workspaceOpRebase")
        : snapshot?.operation === "cherryPick"
          ? t("workspaceOpCherry")
          : snapshot?.operation === "revert"
            ? t("workspaceOpRevert")
            : null;

  const doConfirm = () => {
    const current = confirm;
    if (!current) return;
    if (current.kind === "discard") {
      void run(() => api.discardPaths(path, [current.path]));
    } else if (current.kind === "discard-all") {
      void run(() => api.discardPaths(path, current.paths));
    } else if (current.kind === "delete-branch") {
      void run(() => api.deleteBranch(path, current.name, false));
    } else if (current.kind === "merge") {
      void run(() => api.mergeRef(path, current.name));
    } else if (current.kind === "rebase") {
      void run(() => api.rebaseOnto(path, current.name));
    } else if (current.kind === "force-push") {
      void run(() => api.pushRepo(path, true), t("workspacePushed"));
    } else if (current.kind === "reset") {
      void run(() => api.resetTo(path, current.hash, current.mode));
    }
  };

  const confirmCopy = (() => {
    if (!confirm)
      return {
        title: "",
        description: "",
        destructive: false as boolean,
        requireText: undefined as string | undefined,
      };
    if (confirm.kind === "discard") {
      return {
        title: t("workspaceDiscardTitle"),
        description: t("workspaceDiscardConfirm", { path: confirm.path }),
        destructive: true,
        requireText: undefined,
      };
    }
    if (confirm.kind === "discard-all") {
      return {
        title: t("workspaceDiscardAll"),
        description: t("workspaceDiscardAllConfirm", { files: confirm.paths.length }),
        destructive: true,
        requireText: undefined,
      };
    }
    if (confirm.kind === "delete-branch") {
      return {
        title: t("workspaceDelete"),
        description: t("workspaceDeleteBranchConfirm", { name: confirm.name }),
        destructive: true,
        requireText: undefined,
      };
    }
    if (confirm.kind === "merge") {
      return {
        title: t("workspaceMerge"),
        description: t("workspaceMergeConfirm", { name: confirm.name }),
        destructive: false,
        requireText: undefined,
      };
    }
    if (confirm.kind === "rebase") {
      return {
        title: t("workspaceRebase"),
        description: t("workspaceRebaseConfirm", { name: confirm.name }),
        destructive: false,
        requireText: undefined,
      };
    }
    if (confirm.kind === "force-push") {
      return {
        title: t("workspaceForcePush"),
        description: t("workspaceForcePushConfirm"),
        destructive: true,
        requireText: undefined,
      };
    }
    return {
      title: t("workspaceReset"),
      description:
        confirm.mode === "hard"
          ? t("workspaceResetHardConfirm", { name: status.name })
          : t("workspaceResetConfirm", {
              hash: confirm.hash.slice(0, 7),
              mode: confirm.mode,
            }),
      destructive: confirm.mode === "hard",
      requireText: confirm.mode === "hard" ? status.name : undefined,
    };
  })();

  const tabCounts: Record<Tab, number | null> = {
    changes: files.length,
    branches: localBranchCount || null,
    history: null,
  };

  const tabLabels: Record<Tab, string> = {
    changes: t("workspaceChanges"),
    branches: t("workspaceBranches"),
    history: t("workspaceHistory"),
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="workspace-topbar" {...DRAG_REGION_ATTR}>
        <button
          type="button"
          className="workspace-back"
          data-tauri-no-drag
          aria-label={t("workspaceBack")}
          title={t("workspaceBack")}
          onClick={onBack}
        >
          <ArrowLeftIcon className="size-4" />
        </button>

        <div className="workspace-identity" {...DRAG_REGION_ATTR}>
          <div className="workspace-identity__name">
            <span className="truncate" title={status.name}>
              {status.name}
            </span>
            {status.dirty ? (
              <span
                className="workspace-dirty-dot"
                role="img"
                aria-label={t("workspaceDirty")}
                title={t("workspaceDirty")}
              />
            ) : null}
          </div>
          <div className="workspace-identity__meta">
            {status.branch ? (
              <span className="workspace-chip workspace-chip--branch">
                <GitBranchIcon />
                <span className="max-w-[12rem] truncate">{status.branch}</span>
              </span>
            ) : (
              <span className="workspace-chip">{t("workspaceDetached")}</span>
            )}
            {status.upstream ? (
              <>
                {status.ahead > 0 ? (
                  <span
                    className="workspace-chip workspace-chip--ahead"
                    title={t("workspaceAhead")}
                  >
                    <ArrowUpIcon />
                    {status.ahead}
                  </span>
                ) : null}
                {status.behind > 0 ? (
                  <span
                    className="workspace-chip workspace-chip--behind"
                    title={t("workspaceBehind")}
                  >
                    <ArrowDownIcon />
                    {status.behind}
                  </span>
                ) : null}
                {status.ahead === 0 && status.behind === 0 ? (
                  <span className="workspace-chip workspace-chip--ok">
                    <CheckIcon />
                    {t("workspaceUpToDate")}
                  </span>
                ) : null}
                <span className="workspace-chip" title={status.upstream}>
                  {status.upstream}
                </span>
              </>
            ) : (
              <span className="workspace-chip">{t("workspaceNoUpstream")}</span>
            )}
          </div>
        </div>

        <div className="workspace-toolbar" data-tauri-no-drag>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t("detailReveal")}
            title={t("detailReveal")}
            onClick={() => void revealItemInDir(path)}
          >
            <FolderOpenIcon />
          </Button>
          <div className="workspace-seg" role="group" aria-label={t("workspaceSync")}>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void run(() => api.fetchRepo(path), t("workspaceFetched"))}
            >
              <RefreshCwIcon />
              {t("workspaceFetch")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void run(() => api.pullRepo(path), t("workspacePulled"))}
            >
              <ArrowDownToLineIcon />
              {t("workspacePull")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="default"
              disabled={busy}
              onClick={() =>
                void run(() => api.pushRepo(path, false), t("workspacePushed"))
              }
            >
              <ArrowUpFromLineIcon />
              {t("workspacePush")}
            </Button>
          </div>
          {SHOW_FORCE_PUSH ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("workspaceActions")}
                  title={t("workspaceActions")}
                >
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                  {t("workspaceActions")}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  inset
                  onSelect={() => void revealItemInDir(path)}
                  className="items-start"
                >
                  <FolderOpenIcon />
                  {t("detailReveal")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  inset
                  className="items-start"
                  onSelect={() => setConfirm({ kind: "force-push" })}
                >
                  <TriangleAlertIcon />
                  <span className="flex flex-col gap-0.5">
                    {t("workspaceForcePush")}
                    <span className="workspace-menu-note">
                      {t("workspaceForcePushHint")}
                    </span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>

      {opLabel ? (
        <div className="workspace-banner">
          <span className="workspace-banner__icon">
            <TriangleAlertIcon className="size-4" />
          </span>
          <span className="min-w-0 flex-1 truncate">{opLabel}</span>
          <Button
            type="button"
            size="xs"
            disabled={busy}
            onClick={() => void run(() => api.continueOperation(path))}
          >
            {t("workspaceContinue")}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="destructive"
            disabled={busy}
            onClick={() => void run(() => api.abortOperation(path))}
          >
            {t("workspaceAbort")}
          </Button>
        </div>
      ) : null}

      {error ? (
        <div className="workspace-banner workspace-banner--error" role="alert">
          <span className="workspace-banner__icon">
            <CircleAlertIcon className="size-4" />
          </span>
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={t("workspaceDismiss")}
            title={t("workspaceDismiss")}
            onClick={() => setError(null)}
          >
            <XIcon />
          </Button>
        </div>
      ) : null}

      <div className="workspace-tabs">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={tab}
          onValueChange={(value) => {
            if (value) setTab(value as Tab);
          }}
          aria-label={t("workspaceTabs")}
          className="mac-segment"
        >
          {TABS.map((id) => (
            <ToggleGroupItem key={id} value={id} className="mac-segment-item">
              {tabLabels[id]}
              {tabCounts[id] != null ? (
                <span className="workspace-tab-count">{tabCounts[id]}</span>
              ) : null}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="workspace-tabs__meta">
          {busy || snapshotQuery.isLoading ? (
            <>
              <Spinner className="size-3.5" />
              {t("workspaceBusy")}
            </>
          ) : null}
        </div>
      </div>

      {tab === "changes" ? (
        <>
          <ChangesPanel
            files={files}
            selected={selectedFile}
            diff={diff}
            busy={busy}
            stagedCount={stagedCount}
            unstagedCount={unstagedCount}
            onSelect={setSelectedFile}
            onStage={(files) => void run(() => api.stagePaths(path, files))}
            onUnstage={(files) => void run(() => api.unstagePaths(path, files))}
            onDiscard={(files) => setConfirm({ kind: "discard", path: files[0] ?? "" })}
            onDiscardAll={(files) => setConfirm({ kind: "discard-all", paths: files })}
            onApplyHunk={(hunk: DiffHunk, lines: HunkLineInput[], reverse: boolean) => {
              if (!selectedFile) return;
              void run(() =>
                api.applyHunk(
                  path,
                  selectedFile.path,
                  diff?.header ?? "",
                  hunk.header,
                  lines,
                  reverse,
                ),
              );
            }}
            onConflict={(file, side) =>
              void run(() => api.conflictTake(path, file, side))
            }
            onMarkResolved={(file) => void run(() => api.markResolved(path, file))}
          />
          <CommitBar
            stagedCount={stagedCount}
            message={message}
            amend={amend}
            canAmend={snapshot?.canAmend ?? false}
            busy={busy}
            onMessageChange={setMessage}
            onAmendChange={setAmend}
            onSubmit={() => {
              void run(
                () => api.commitRepo(path, message, amend),
                t("workspaceCommitted"),
              ).then((next) => {
                if (next) {
                  setMessage("");
                  setAmend(false);
                }
              });
            }}
          />
        </>
      ) : null}

      {tab === "branches" ? (
        <BranchesPanel
          branches={refsQuery.data?.branches ?? []}
          tags={refsQuery.data?.tags ?? []}
          stashes={refsQuery.data?.stashes ?? []}
          remotes={snapshot?.remotes ?? []}
          busy={busy}
          loading={refsQuery.data == null}
          onCheckout={(name) => void run(() => api.checkoutRef(path, name))}
          onCreateBranch={(name) => void run(() => api.createBranch(path, name, true))}
          onDeleteBranch={(name) => setConfirm({ kind: "delete-branch", name })}
          onMerge={(name) => setConfirm({ kind: "merge", name })}
          onRebase={(name) => setConfirm({ kind: "rebase", name })}
          onCreateTag={(name) => void run(() => api.createTag(path, name))}
          onDeleteTag={(name) => void run(() => api.deleteTag(path, name))}
          onPushTags={() => void run(() => api.pushTags(path))}
          onStashPush={() => void run(() => api.stashPush(path))}
          onStashApply={(selector, pop) =>
            void run(() => api.stashApply(path, selector, pop))
          }
          onStashDrop={(selector) => void run(() => api.stashDrop(path, selector))}
          onAddRemote={(name, url) =>
            void run(async () => {
              await api.addRemote(path, name, url);
              return api.workspaceSnapshot(path);
            })
          }
          onPublishGithub={(name, privateRepo) =>
            void run(async () => {
              await api.publishToGithub(path, name, privateRepo);
              return api.workspaceSnapshot(path);
            })
          }
        />
      ) : null}

      {tab === "history" ? (
        <HistoryPanel
          commits={commits}
          hasMore={hasMore}
          busy={busy}
          formatDate={formatDate}
          search={search}
          selected={selectedCommit}
          blame={blame}
          fileHistory={fileHistory}
          onSearch={(q) => {
            setSearch(q);
            void api
              .commitsPage(path, 0, 50, q || undefined)
              .then((page) => {
                setCommits(page);
                setHasMore(page.length === 50);
              })
              .catch((e) => setError(String(e)));
          }}
          onLoadMore={() => void loadCommits(false)}
          onSelect={setSelectedCommit}
          onCheckout={(hash) => void run(() => api.checkoutRef(path, hash))}
          onCherryPick={(hash) => void run(() => api.cherryPick(path, hash))}
          onRevert={(hash) => void run(() => api.revertCommit(path, hash))}
          onReset={(hash, mode) => setConfirm({ kind: "reset", hash, mode })}
          onFileHistory={(filePath) => {
            void api
              .fileHistory(path, filePath)
              .then(setFileHistory)
              .catch((e) => setError(String(e)));
          }}
          onBlame={(filePath) => {
            void api
              .blameFile(path, filePath)
              .then(setBlame)
              .catch((e) => setError(String(e)));
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirm != null}
        title={confirmCopy.title}
        description={confirmCopy.description}
        destructive={confirmCopy.destructive}
        requireText={confirmCopy.requireText}
        onConfirm={doConfirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      />
    </div>
  );
}
