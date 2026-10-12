import { memo } from "react";
import { GitBranchIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { RemoteProviderIcon } from "@/components/repo/RemoteProviderIcon";
import { useI18n } from "@/hooks/useI18n";
import { displayPath } from "@/components/repo/fleet";
import type { BatchProgress, RepoStatus } from "@/lib/tauri";

export const RepoRowBody = memo(function RepoRowBody({
  repo,
  progress,
  selected,
  onToggle,
  onOpen,
}: {
  repo: RepoStatus;
  progress?: BatchProgress;
  selected: boolean;
  onToggle: (path: string) => void;
  onOpen: (repo: RepoStatus) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <span
        className="repo-row__check"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggle(repo.path)}
          aria-label={t("selectRepo", { name: repo.name })}
        />
      </span>
      <span className="repo-row__identity">
        <RemoteProviderIcon provider={repo.remoteProvider} className="repo-row__icon" />
        <button
          type="button"
          className="repo-row__name"
          title={repo.name}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(repo);
          }}
        >
          {repo.name}
        </button>
        <span className="repo-row__path" title={repo.path}>
          {displayPath(repo.path)}
        </span>
      </span>
      <span className="repo-row__branch" title={repo.branch ?? undefined}>
        <GitBranchIcon aria-hidden="true" />
        <span className="truncate">{repo.branch ?? "-"}</span>
      </span>
      <SyncCell ahead={repo.ahead} behind={repo.behind} upstream={repo.upstream} />
      <StateCell repo={repo} progress={progress} />
    </>
  );
});

/** Longest bar a side can show; counts past this just read as "a lot". */
const SYNC_BAR_CAP = 12;
const SYNC_BAR_MAX_REM = 3;

function syncBarWidth(count: number): string {
  if (count <= 0) return "0";
  const share = Math.min(1, 0.16 + (count / SYNC_BAR_CAP) * 0.84);
  return `${(share * SYNC_BAR_MAX_REM).toFixed(2)}rem`;
}

/**
 * Diverging bar around the upstream axis: behind grows left (the amber the
 * fleet lane acts on), ahead grows right, each with its count at the tip.
 * A synced repo is just the axis.
 */
const SyncCell = memo(function SyncCell({
  ahead,
  behind,
  upstream,
}: {
  ahead: number;
  behind: number;
  upstream: string | null;
}) {
  const { t } = useI18n();

  if (!upstream) {
    return <span className="sync sync--none">{t("noUpstream")}</span>;
  }
  return (
    <span className="sync" title={upstream}>
      <span className="sync__side sync__side--behind">
        {behind > 0 ? (
          <span className="sync__n">
            {behind}
            <span className="sr-only">{t("behindCount", { count: behind })}</span>
          </span>
        ) : null}
        <i aria-hidden="true" style={{ width: syncBarWidth(behind) }} />
      </span>
      <span className="sync__axis" aria-hidden="true" />
      <span className="sync__side">
        <i aria-hidden="true" style={{ width: syncBarWidth(ahead) }} />
        {ahead > 0 ? (
          <span className="sync__n">
            {ahead}
            <span className="sr-only">{t("aheadCount", { count: ahead })}</span>
          </span>
        ) : null}
      </span>
      {ahead === 0 && behind === 0 ? (
        <span className="sr-only">{t("synced")}</span>
      ) : null}
    </span>
  );
});

const StateCell = memo(function StateCell({
  repo,
  progress,
}: {
  repo: RepoStatus;
  progress?: BatchProgress;
}) {
  const { t, tStage, tMessage } = useI18n();

  // A refresh finishes too fast for a per-row label to be readable; the sweep on
  // the board's top rule covers it. Fetch / fast-forward stages still show here.
  if (progress && progress.stage !== "refreshing") {
    const msg = tMessage(progress.message);
    const label = msg ?? tStage(progress.stage);
    const tone =
      progress.stage === "error"
        ? "error"
        : progress.stage === "done"
          ? "ok"
          : progress.stage === "skipped"
            ? "quiet"
            : "run";
    return (
      <span className="repo-row__state" data-tone={tone} title={label}>
        {tone === "run" ? <Spinner className="size-3" /> : <i aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </span>
    );
  }
  if (repo.lastError) {
    return (
      <span className="repo-row__state" data-tone="error" title={repo.lastError}>
        <i aria-hidden="true" />
        <span className="truncate">{repo.lastError.split("\n", 1)[0] || t("error")}</span>
      </span>
    );
  }
  if (repo.dirty) {
    return (
      <span className="repo-row__state" data-tone="dirty">
        <i aria-hidden="true" />
        <span className="truncate">
          {repo.behind > 0 ? t("dirtySkips") : t("filterDirty")}
        </span>
      </span>
    );
  }
  // A clean repo says nothing: the board only speaks up for rows that need a look.
  // The empty cell still holds its grid column so the grip stays at the row's end.
  return (
    <span className="repo-row__state">
      <span className="sr-only">{t("clean")}</span>
    </span>
  );
});
