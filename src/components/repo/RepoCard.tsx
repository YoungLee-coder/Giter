import { memo, type PointerEvent as ReactPointerEvent } from "react";
import { FolderGit2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/i18n";
import type { BatchProgress, RepoStatus } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/appStore";

export const RepoCardBody = memo(function RepoCardBody({
  repo,
  progress,
  selected,
  onToggle,
  className,
}: {
  repo: RepoStatus;
  progress?: BatchProgress;
  selected: boolean;
  onToggle: (path: string) => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex min-w-0 items-start gap-2.5 px-(--card-spacing) pt-(--card-spacing)">
        <div
          className="shrink-0 pt-1"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggle(repo.path)}
            aria-label={t("selectRepo", { name: repo.name })}
          />
        </div>
        <div className="repo-card-icon" aria-hidden="true">
          <FolderGit2Icon className="size-4" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <h3
              className="min-w-0 flex-1 truncate text-sm leading-snug font-bold tracking-tight"
              title={repo.name}
            >
              {repo.name}
            </h3>
            <div className="shrink-0">
              <SyncBadge
                ahead={repo.ahead}
                behind={repo.behind}
                upstream={repo.upstream}
              />
            </div>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span
              className="min-w-0 truncate font-mono text-xs text-muted-foreground"
              title={repo.branch ?? undefined}
            >
              {repo.branch ?? "-"}
            </span>
            <div className="shrink-0">
              <StatusCell repo={repo} progress={progress} />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 min-w-0 border-t border-border/70 px-(--card-spacing) py-2.5">
        <p
          className="truncate font-mono text-xs leading-snug text-muted-foreground"
          title={repo.path}
        >
          {repo.path}
        </p>
      </div>
    </div>
  );
});

/** Card that subscribes to its own progress slice — avoids grid-wide re-renders. */
export const RepoGridCard = memo(function RepoGridCard({
  repo,
  selected,
  isDragging,
  isPressing,
  onToggle,
  onOpenDetail,
  onPointerDown,
  shouldIgnoreClick,
}: {
  repo: RepoStatus;
  selected: boolean;
  isDragging: boolean;
  isPressing: boolean;
  onToggle: (path: string) => void;
  onOpenDetail: (repo: RepoStatus) => void;
  onPointerDown: (repo: RepoStatus, event: ReactPointerEvent<HTMLElement>) => void;
  shouldIgnoreClick: () => boolean;
}) {
  const progress = useAppStore((s) => s.progress[repo.path]);

  return (
    <div
      role="listitem"
      data-repo-path={repo.path}
      className="repo-card-slot min-w-0"
    >
      <Card
        size="sm"
        className={cn(
          "repo-card h-full cursor-pointer gap-0 border bg-card py-0",
          selected && !isDragging && "is-selected",
          isDragging && "is-drag-slot",
          isPressing && !isDragging && "is-long-pressing",
        )}
        aria-hidden={isDragging || undefined}
        onPointerDown={(e) => {
          if (isDragging) return;
          onPointerDown(repo, e);
        }}
        onContextMenu={(e) => {
          if (isDragging || isPressing) e.preventDefault();
        }}
        onClick={(e) => {
          if (shouldIgnoreClick() || isDragging) return;
          const target = e.target as HTMLElement;
          if (target.closest("button, input, a, label, [data-slot='checkbox']")) {
            return;
          }
          onOpenDetail(repo);
        }}
      >
        {/* Keep body mounted (invisible) so slot size never jumps. */}
        <RepoCardBody
          className={cn(isDragging && "invisible")}
          repo={repo}
          progress={progress}
          selected={selected}
          onToggle={onToggle}
        />
      </Card>
    </div>
  );
});

const SyncBadge = memo(function SyncBadge({
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
    return <Badge variant="secondary">{t("noUpstream")}</Badge>;
  }
  if (ahead === 0 && behind === 0) {
    return (
      <Badge
        variant="secondary"
        className="bg-[color-mix(in_srgb,var(--ok)_18%,transparent)] text-[var(--ok)]"
      >
        {t("synced")}
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="bg-[color-mix(in_srgb,var(--warn)_20%,transparent)] text-[var(--warn)]"
    >
      {behind > 0 ? `↓${behind}` : ""}
      {ahead > 0 && behind > 0 ? " " : ""}
      {ahead > 0 ? `↑${ahead}` : ""}
    </Badge>
  );
});

const StatusCell = memo(function StatusCell({
  repo,
  progress,
}: {
  repo: RepoStatus;
  progress?: BatchProgress;
}) {
  const { t, tStage, tMessage } = useI18n();

  if (progress) {
    const msg = tMessage(progress.message);
    const label = `${tStage(progress.stage)}${msg ? `: ${msg}` : ""}`;
    if (progress.stage === "error") {
      return (
        <Badge variant="destructive" title={msg ?? undefined}>
          {label}
        </Badge>
      );
    }
    if (progress.stage === "skipped") {
      return (
        <Badge variant="secondary" title={msg ?? undefined}>
          {label}
        </Badge>
      );
    }
    if (progress.stage === "done") {
      return (
        <Badge
          variant="secondary"
          className="bg-[color-mix(in_srgb,var(--ok)_18%,transparent)] text-[var(--ok)]"
          title={msg ?? undefined}
        >
          {label}
        </Badge>
      );
    }
    return (
      <Badge
        variant="outline"
        className="border-[color-mix(in_srgb,var(--run)_40%,transparent)] bg-[color-mix(in_srgb,var(--run)_12%,transparent)] text-[var(--run)]"
        title={msg ?? undefined}
      >
        {label}
      </Badge>
    );
  }
  if (repo.lastError) {
    return (
      <Badge variant="destructive" title={repo.lastError}>
        {t("error")}
      </Badge>
    );
  }
  if (repo.dirty) {
    return (
      <Badge
        variant="secondary"
        className="bg-[color-mix(in_srgb,var(--warn)_20%,transparent)] text-[var(--warn)]"
      >
        {t("dirty")}
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="bg-[color-mix(in_srgb,var(--ok)_18%,transparent)] text-[var(--ok)]"
    >
      {t("clean")}
    </Badge>
  );
});
