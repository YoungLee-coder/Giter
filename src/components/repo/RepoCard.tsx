import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RemoteProviderIcon } from "@/components/repo/RemoteProviderIcon";
import { useI18n } from "@/hooks/useI18n";
import type { BatchProgress, RepoStatus } from "@/lib/tauri";
import { cn } from "@/lib/utils";

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
          <RemoteProviderIcon provider={repo.remoteProvider} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pr-6">
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
