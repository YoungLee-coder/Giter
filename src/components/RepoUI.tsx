import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import type { BatchProgress, RepoStatus } from "../lib/tauri";

type Props = {
  busy: boolean;
  refreshing: boolean;
  selectedCount: number;
  totalCount: number;
  onAdd: () => void;
  onScan: () => void;
  onRefresh: () => void;
  onFetch: () => void;
  onUpdate: () => void;
  onRemoveSelected: () => void;
};

export function BatchBar({
  busy,
  refreshing,
  selectedCount,
  totalCount,
  onAdd,
  onScan,
  onRefresh,
  onFetch,
  onUpdate,
  onRemoveSelected,
}: Props) {
  const { t } = useI18n();
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!addRef.current?.contains(event.target as Node)) {
        setAddOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAddOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [addOpen]);

  useEffect(() => {
    if (busy) setAddOpen(false);
  }, [busy]);

  return (
    <>
      <div className="toolbar__group">
        <div className="split-btn" ref={addRef}>
          <button
            type="button"
            className="split-btn__main"
            onClick={onAdd}
            disabled={busy}
          >
            {t("add")}
          </button>
          <button
            type="button"
            className="split-btn__caret"
            aria-label={t("addMenu")}
            aria-haspopup="menu"
            aria-expanded={addOpen}
            disabled={busy}
            onClick={() => setAddOpen((open) => !open)}
          >
            <CaretIcon />
          </button>
          {addOpen && (
            <div className="split-btn__menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="split-btn__item"
                onClick={() => {
                  setAddOpen(false);
                  onAdd();
                }}
              >
                {t("addRepo")}
              </button>
              <button
                type="button"
                role="menuitem"
                className="split-btn__item"
                onClick={() => {
                  setAddOpen(false);
                  onScan();
                }}
              >
                {t("scanFolder")}
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className="ghost"
          onClick={onRefresh}
          disabled={busy || refreshing}
          aria-busy={refreshing}
        >
          {refreshing ? t("refreshing") : t("refresh")}
        </button>
      </div>

      <div className="toolbar__spacer" data-tauri-drag-region />

      <div className="toolbar__group">
        <span className="selection-meta">
          {t("selectedCount", { selected: selectedCount, total: totalCount })}
        </span>
        <button
          type="button"
          className="ghost danger"
          onClick={onRemoveSelected}
          disabled={busy || selectedCount === 0}
        >
          {t("remove")}
        </button>
        <button type="button" onClick={onFetch} disabled={busy || selectedCount === 0}>
          {t("fetch")}
        </button>
        <button
          type="button"
          className="primary"
          onClick={onUpdate}
          disabled={busy || selectedCount === 0}
        >
          {t("update")}
        </button>
      </div>
    </>
  );
}

function CaretIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      <path d="M1.2 2.6 4 5.4l2.8-2.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type GridProps = {
  repos: RepoStatus[];
  selected: Set<string>;
  progress: Record<string, BatchProgress>;
  onToggle: (path: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onOpenDetail: (repo: RepoStatus) => void;
};

export function RepoGrid({
  repos,
  selected,
  progress,
  onToggle,
  onSelectAll,
  onClearSelection,
  onOpenDetail,
}: GridProps) {
  const { t } = useI18n();
  const headerCheckRef = useRef<HTMLInputElement>(null);
  const allSelected = repos.length > 0 && selected.size === repos.length;
  const someSelected = selected.size > 0 && !allSelected;

  useEffect(() => {
    if (headerCheckRef.current) {
      headerCheckRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  if (repos.length === 0) {
    return (
      <div className="empty">
        <p className="empty__title">{t("emptyTitle")}</p>
        <p className="empty__hint">{t("emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="repo-grid-wrap">
      <div className="repo-grid-toolbar">
        <label className="repo-grid-toolbar__select">
          <input
            ref={headerCheckRef}
            type="checkbox"
            checked={allSelected}
            onChange={() => {
              if (allSelected) onClearSelection();
              else onSelectAll();
            }}
            aria-label={t("selectAll")}
          />
          <span>{t("selectAll")}</span>
        </label>
      </div>
      <div className="repo-grid" role="list">
        {repos.map((repo) => {
          const p = progress[repo.path];
          const isSelected = selected.has(repo.path);
          return (
            <article
              key={repo.path}
              role="listitem"
              className={`repo-card${isSelected ? " is-selected" : ""}`}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest("button, input, a, label")) return;
                onOpenDetail(repo);
              }}
            >
              <div className="repo-card__top">
                <label className="repo-card__check" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(repo.path)}
                    aria-label={t("selectRepo", { name: repo.name })}
                  />
                </label>
                <h3 className="repo-card__name" title={repo.name}>
                  {repo.name}
                </h3>
                <SyncBadge
                  ahead={repo.ahead}
                  behind={repo.behind}
                  upstream={repo.upstream}
                />
              </div>
              <div className="repo-card__meta">
                <span className="repo-card__branch mono" title={repo.branch ?? undefined}>
                  {repo.branch ?? "-"}
                </span>
                <StatusCell repo={repo} progress={p} />
              </div>
              <p className="repo-card__path mono path" title={repo.path}>
                {repo.path}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function SyncBadge({
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
    return <span className="badge muted">{t("noUpstream")}</span>;
  }
  if (ahead === 0 && behind === 0) {
    return <span className="badge ok">{t("synced")}</span>;
  }
  return (
    <span className="badge warn">
      {behind > 0 ? `↓${behind}` : ""}
      {ahead > 0 && behind > 0 ? " " : ""}
      {ahead > 0 ? `↑${ahead}` : ""}
    </span>
  );
}

function StatusCell({
  repo,
  progress,
}: {
  repo: RepoStatus;
  progress?: BatchProgress;
}) {
  const { t, tStage, tMessage } = useI18n();

  if (progress) {
    const cls =
      progress.stage === "error"
        ? "badge err"
        : progress.stage === "skipped"
          ? "badge muted"
          : progress.stage === "done"
            ? "badge ok"
            : "badge run";
    const msg = tMessage(progress.message);
    return (
      <span className={cls} title={msg ?? undefined}>
        {tStage(progress.stage)}
        {msg ? `: ${msg}` : ""}
      </span>
    );
  }
  if (repo.lastError) {
    return (
      <span className="badge err" title={repo.lastError}>
        {t("error")}
      </span>
    );
  }
  if (repo.dirty) {
    return <span className="badge warn">{t("dirty")}</span>;
  }
  return <span className="badge ok">{t("clean")}</span>;
}
