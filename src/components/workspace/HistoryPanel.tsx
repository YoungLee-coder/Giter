import { useState } from "react";
import {
  FileTextIcon,
  GitCommitHorizontalIcon,
  HistoryIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CommitGraph } from "@/components/repo/CommitGraph";
import { useI18n } from "@/hooks/useI18n";
import type { BlameLine, CommitInfo } from "@/lib/tauri";

type Props = {
  commits: CommitInfo[];
  hasMore: boolean;
  busy: boolean;
  formatDate: (iso: string) => string;
  search: string;
  selected: CommitInfo | null;
  blame: BlameLine[] | null;
  fileHistory: CommitInfo[] | null;
  onSearch: (query: string) => void;
  onLoadMore: () => void;
  onSelect: (commit: CommitInfo) => void;
  onCheckout: (hash: string) => void;
  onCherryPick: (hash: string) => void;
  onRevert: (hash: string) => void;
  onReset: (hash: string, mode: "soft" | "mixed" | "hard") => void;
  onFileHistory: (path: string) => void;
  onBlame: (path: string) => void;
};

export function HistoryPanel({
  commits,
  hasMore,
  busy,
  formatDate,
  search,
  selected,
  blame,
  fileHistory,
  onSearch,
  onLoadMore,
  onSelect,
  onCheckout,
  onCherryPick,
  onRevert,
  onReset,
  onFileHistory,
  onBlame,
}: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState(search);
  const [filePath, setFilePath] = useState("");

  return (
    <div className="workspace-split workspace-split--aside-end">
      <div className="workspace-split__main">
        <div className="workspace-pane-head">
          <span className="relative flex min-w-0 flex-1 items-center">
            <SearchIcon className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("workspaceSearch")}
              className="h-7 pr-7 pl-7 text-xs"
              disabled={busy}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSearch(query);
              }}
            />
            {query ? (
              <button
                type="button"
                className="absolute right-1 flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={t("workspaceSearchClear")}
                title={t("workspaceSearchClear")}
                onClick={() => {
                  setQuery("");
                  onSearch("");
                }}
              >
                <XIcon className="size-3.5" />
              </button>
            ) : null}
          </span>
        </div>
        <div className="giter-scroll min-h-0 flex-1 overflow-auto p-2">
          {commits.length === 0 ? (
            <div className="workspace-empty">
              <span className="workspace-empty__icon">
                <HistoryIcon />
              </span>
              <p className="workspace-empty__title">
                {search
                  ? t("workspaceNoCommitResults", { query: search })
                  : t("detailNoCommits")}
              </p>
            </div>
          ) : (
            <CommitGraph
              className="commit-graph--interactive"
              commits={commits}
              formatDate={formatDate}
              onSelectCommit={onSelect}
              selectedHash={selected?.hash}
            />
          )}
          {hasMore ? (
            <div className="mt-3 flex justify-center">
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={busy}
                onClick={onLoadMore}
              >
                {t("workspaceLoadMore")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="workspace-split__aside">
        <div className="giter-scroll min-h-0 flex-1 overflow-auto">
          {selected ? (
            <div className="workspace-detail">
              <div>
                <p className="workspace-detail__subject">{selected.subject}</p>
                <div className="workspace-detail__meta">
                  <span className="workspace-avatar">
                    {selected.author.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="max-w-[9rem] truncate" title={selected.author}>
                    {selected.author}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDate(selected.date)}</span>
                  <span className="workspace-chip font-mono">{selected.shortHash}</span>
                </div>
              </div>

              <div className="workspace-action-group">
                <span className="workspace-action-group__label">
                  {t("workspaceCommitActions")}
                </span>
                <div className="workspace-action-group__row">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onCheckout(selected.hash)}
                  >
                    {t("workspaceCheckout")}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onCherryPick(selected.hash)}
                  >
                    {t("workspaceCherryPick")}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onRevert(selected.hash)}
                  >
                    {t("workspaceRevert")}
                  </Button>
                </div>
              </div>

              <div className="workspace-action-group">
                <span className="workspace-action-group__label">
                  {t("workspaceResetGroup")}
                </span>
                <div className="workspace-action-group__row">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onReset(selected.hash, "soft")}
                  >
                    {t("workspaceResetSoft")}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onReset(selected.hash, "mixed")}
                  >
                    {t("workspaceResetMixed")}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => onReset(selected.hash, "hard")}
                  >
                    {t("workspaceResetHard")}
                  </Button>
                </div>
              </div>

              <div className="workspace-action-group">
                <span className="workspace-action-group__label">
                  {t("workspaceFileTools")}
                </span>
                <Input
                  value={filePath}
                  onChange={(event) => setFilePath(event.target.value)}
                  placeholder="src/components/App.tsx"
                  className="h-7 font-mono text-xs"
                  disabled={busy}
                />
                <div className="workspace-action-group__row">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={!filePath.trim() || busy}
                    onClick={() => onFileHistory(filePath.trim())}
                  >
                    {t("workspaceFileHistory")}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={!filePath.trim() || busy}
                    onClick={() => onBlame(filePath.trim())}
                  >
                    {t("workspaceBlame")}
                  </Button>
                </div>
                {fileHistory ? (
                  fileHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("workspaceFileHistoryEmpty")}
                    </p>
                  ) : (
                    <div className="workspace-card">
                      {fileHistory.map((commit) => (
                        <div key={commit.hash} className="workspace-row">
                          <GitCommitHorizontalIcon className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-xs">
                            {commit.subject}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {commit.shortHash}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {formatDate(commit.date)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                ) : null}
                {blame ? (
                  <div className="workspace-hunk">
                    <div className="workspace-diff__body giter-scroll max-h-72 overflow-auto">
                      {blame.map((line) => (
                        <div
                          key={`${line.hash}-${line.number}`}
                          className="workspace-diff-line"
                        >
                          <span className="workspace-diff-line__num">{line.number}</span>
                          <span
                            className="workspace-diff-line__sign shrink-0 text-muted-foreground"
                            style={{ width: "4.75rem" }}
                          >
                            {line.hash.slice(0, 8)}
                          </span>
                          <span className="workspace-diff-line__text">
                            {line.line || " "}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="workspace-empty">
              <span className="workspace-empty__icon">
                <FileTextIcon />
              </span>
              <p className="workspace-empty__title">{t("workspaceSelectCommit")}</p>
              <p className="workspace-empty__desc">{t("workspaceSelectCommitHint")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
