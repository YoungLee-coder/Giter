import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownToLineIcon,
  FolderGit2Icon,
  GripVerticalIcon,
  RefreshCwIcon,
  SearchIcon,
  SearchXIcon,
} from "lucide-react";
import { RepoRowBody } from "@/components/repo/RepoRow";
import {
  FLEET_FILTERS,
  FLEET_SECTIONS,
  canFastForward,
  countFleet,
  fleetSectionOf,
  matchesFleetFilter,
  matchesFleetQuery,
  type FleetFilter,
  type FleetSection,
} from "@/components/repo/fleet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppUi } from "@/hooks/AppUiProvider";
import { useI18n } from "@/hooks/useI18n";
import { useRepoDragSort } from "@/hooks/useRepoDragSort";
import { useSpinCycles } from "@/hooks/useSpinCycles";
import type { RepoStatus } from "@/lib/tauri";
import { cn } from "@/lib/utils";

const VIRTUALIZE_THRESHOLD = 48;
const ROW_HEIGHT = 44;
const SECTION_HEIGHT = 40;
const NO_PATHS: ReadonlySet<string> = new Set();
/** The staggered entrance plays once per launch, not on every return to the board. */
let boardHasEntered = false;

type LedgerItem =
  | { kind: "section"; section: FleetSection; repos: RepoStatus[] }
  | { kind: "row"; repo: RepoStatus };

const SECTION_LABEL_KEYS: Record<FleetSection, string> = {
  error: "sectionError",
  behind: "sectionBehind",
  rest: "sectionRest",
};

type ListProps = {
  repos: RepoStatus[];
  selected: Set<string>;
  busy: boolean;
  onToggle: (path: string) => void;
  onSelectAll: (paths: string[]) => void;
  onClearSelection: () => void;
  onOpenDetail: (repo: RepoStatus) => void;
  onReorder: (paths: string[]) => void;
  onBatch: (mode: "fetch" | "update", paths: string[]) => void;
  onAdd: () => void;
  onScan: () => void;
};

const FILTER_LABEL_KEYS: Record<FleetFilter, string> = {
  all: "filterAll",
  behind: "filterBehind",
  ahead: "filterAhead",
  dirty: "filterDirty",
  error: "filterError",
};

export function RepoList({
  repos,
  selected,
  busy,
  onToggle,
  onSelectAll,
  onClearSelection,
  onOpenDetail,
  onReorder,
  onBatch,
  onAdd,
  onScan,
}: ListProps) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const { busy: working } = useAppUi();
  // Refresh and batch runs both sweep the board's top rule while they work.
  const sweeping = useSpinCycles(working, 900);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<FleetFilter>("all");
  const [query, setQuery] = useState("");
  const [dragPhase, setDragPhase] = useState<"idle" | "dragging" | "settling">("idle");

  const counts = useMemo(() => countFleet(repos), [repos]);
  // A bucket can empty out after a batch run; fall back instead of showing nothing.
  const activeFilter = counts[filter] > 0 ? filter : "all";
  const visible = useMemo(
    () =>
      repos.filter(
        (repo) =>
          matchesFleetFilter(repo, activeFilter) && matchesFleetQuery(repo, query),
      ),
    [repos, activeFilter, query],
  );

  // Rows keep the user's order inside each section; sections sort by urgency.
  const items = useMemo(() => {
    const out: LedgerItem[] = [];
    for (const section of FLEET_SECTIONS) {
      const group = visible.filter((repo) => fleetSectionOf(repo) === section);
      if (group.length === 0) continue;
      out.push({ kind: "section", section, repos: group });
      for (const repo of group) out.push({ kind: "row", repo });
    }
    return out;
  }, [visible]);

  const narrowed = activeFilter !== "all" || query.trim() !== "";
  const shouldVirtualize = dragPhase === "idle" && visible.length >= VIRTUALIZE_THRESHOLD;
  // Reordering a filtered slice has no obvious meaning for the hidden rows.
  const canReorder = !narrowed && !shouldVirtualize && !busy;
  const { sensors, handleDragEnd } = useRepoDragSort(repos, onReorder);
  const itemIds = useMemo(
    () => items.flatMap((item) => (item.kind === "row" ? [item.repo.path] : [])),
    [items],
  );

  const visibleSelected = visible.filter((repo) => selected.has(repo.path)).length;
  const allVisibleSelected = visible.length > 0 && visibleSelected === visible.length;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? items.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      items[index]?.kind === "section" ? SECTION_HEIGHT : ROW_HEIGHT,
    overscan: 12,
  });

  // Flash rows that just changed section (e.g. fast-forwarded out of "behind"),
  // so the result of a batch run is visible where it landed.
  const sectionByPath = useMemo(
    () => new Map(repos.map((repo) => [repo.path, fleetSectionOf(repo)])),
    [repos],
  );
  const prevSections = useRef(sectionByPath);
  const [arrived, setArrived] = useState(NO_PATHS);
  useEffect(() => {
    const prev = prevSections.current;
    prevSections.current = sectionByPath;
    const moved = new Set<string>();
    for (const [path, section] of sectionByPath) {
      const was = prev.get(path);
      if (was && was !== section) moved.add(path);
    }
    if (moved.size > 0) setArrived(moved);
  }, [sectionByPath]);
  useEffect(() => {
    if (arrived.size === 0) return;
    const id = window.setTimeout(() => setArrived(NO_PATHS), 1400);
    return () => window.clearTimeout(id);
  }, [arrived]);

  const [entering, setEntering] = useState(!boardHasEntered);
  useEffect(() => {
    if (!entering) return;
    boardHasEntered = true;
    const id = window.setTimeout(() => setEntering(false), 700);
    return () => window.clearTimeout(id);
  }, [entering]);

  if (repos.length === 0) {
    return (
      <div className="fleet-empty">
        <span className="fleet-empty__icon" aria-hidden="true">
          <FolderGit2Icon />
        </span>
        <p className="fleet-empty__title">{t("emptyTitle")}</p>
        <p className="fleet-empty__hint">{t("emptyHint")}</p>
        <div className="mt-3 flex items-center gap-2">
          <Button type="button" onClick={onAdd} disabled={busy}>
            {t("addRepo")}
          </Button>
          <Button type="button" variant="outline" onClick={onScan} disabled={busy}>
            {t("scanFolder")}
          </Button>
        </div>
      </div>
    );
  }

  const renderItem = (item: LedgerItem, index: number, style?: CSSProperties) =>
    item.kind === "section" ? (
      <SectionHead
        key={`section:${item.section}`}
        section={item.section}
        repos={item.repos}
        busy={busy}
        onBatch={onBatch}
        style={{ ...style, "--i": Math.min(index, 12) } as CSSProperties}
      />
    ) : (
      <SortableRepoRow
        key={item.repo.path}
        repo={item.repo}
        selected={selected.has(item.repo.path)}
        arrived={arrived.has(item.repo.path)}
        canReorder={canReorder}
        onToggle={onToggle}
        onOpenDetail={onOpenDetail}
        style={{ ...style, "--i": Math.min(index, 12) } as CSSProperties}
      />
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="fleet-bar">
        <div className="fleet-filters" role="tablist" aria-label={t("filterLabel")}>
          {FLEET_FILTERS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="fleet-filter"
              aria-selected={activeFilter === id}
              data-tone={id}
              disabled={id !== "all" && counts[id] === 0}
              onClick={() => setFilter(id)}
            >
              {activeFilter === id ? (
                <motion.span
                  layoutId="fleet-filter-pill"
                  className="fleet-filter__pill"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 380, damping: 32 }
                  }
                />
              ) : null}
              <span className="fleet-filter__label">{t(FILTER_LABEL_KEYS[id])}</span>
              <span className="fleet-filter__count">{counts[id]}</span>
            </button>
          ))}
        </div>
        <label className="fleet-search">
          <SearchIcon aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder={t("filterPlaceholder")}
            aria-label={t("filterPlaceholder")}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      <div
        className="fleet-activity"
        data-active={sweeping || undefined}
        aria-hidden="true"
      />
      <div ref={scrollRef} className="giter-scroll fleet-scroll">
        <div
          className={cn(
            "repo-ledger",
            dragPhase !== "idle" && "is-reordering",
            entering && "is-entering",
          )}
          data-reorder={canReorder}
        >
          <div className="repo-ledger__head">
            <span className="repo-row__check">
              <Checkbox
                checked={
                  allVisibleSelected
                    ? true
                    : visibleSelected > 0
                      ? "indeterminate"
                      : false
                }
                disabled={busy || visible.length === 0}
                aria-label={t("selectAll")}
                title={t("selectAll")}
                onCheckedChange={() => {
                  if (allVisibleSelected) onClearSelection();
                  else onSelectAll(visible.map((repo) => repo.path));
                }}
              />
            </span>
            <span>{t("colName")}</span>
            <span>{t("colBranch")}</span>
            <span className="repo-ledger__sync-head">
              <span>{t("filterBehind")}</span>
              <i aria-hidden="true" />
              <span>{t("filterAhead")}</span>
            </span>
            <span>{t("colStatus")}</span>
            <span aria-hidden="true" />
          </div>

          {visible.length === 0 ? (
            <div className="fleet-empty fleet-empty--inline">
              <span className="fleet-empty__icon" aria-hidden="true">
                <SearchXIcon />
              </span>
              <p className="fleet-empty__title">{t("filterEmptyTitle")}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setFilter("all");
                  setQuery("");
                }}
              >
                {t("filterReset")}
              </Button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={() => setDragPhase("dragging")}
              onDragCancel={() => setDragPhase("idle")}
              onDragEnd={(event) => {
                const { active, over } = event;
                // Sections are derived from state, so a drop only reorders within one.
                const sameSection =
                  over != null &&
                  sectionByPath.get(String(active.id)) ===
                    sectionByPath.get(String(over.id));
                // flushSync: paint the new DOM order before dnd-kit clears transforms.
                if (over && active.id !== over.id && sameSection) {
                  flushSync(() => handleDragEnd(event));
                }
                // Hold the plain layout for two frames so the order settles before
                // a long list switches back to virtualized absolute rows.
                setDragPhase("settling");
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => setDragPhase("idle"));
                });
              }}
            >
              <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                {shouldVirtualize ? (
                  <div
                    role="list"
                    className="relative"
                    style={{ height: virtualizer.getTotalSize() }}
                  >
                    {virtualizer.getVirtualItems().map((item) =>
                      renderItem(items[item.index], item.index, {
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${item.start}px)`,
                      }),
                    )}
                  </div>
                ) : (
                  <div role="list">
                    {items.map((item, index) => renderItem(item, index))}
                  </div>
                )}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
    </div>
  );
}

/** Section title plus the one fleet action that clears it, no selection needed. */
const SectionHead = memo(function SectionHead({
  section,
  repos,
  busy,
  onBatch,
  style,
}: {
  section: FleetSection;
  repos: RepoStatus[];
  busy: boolean;
  onBatch: (mode: "fetch" | "update", paths: string[]) => void;
  style?: CSSProperties;
}) {
  const { t } = useI18n();
  const ready = section === "behind" ? repos.filter(canFastForward) : [];
  const skipped = repos.length - ready.length;

  return (
    <div className="ledger-section" data-section={section} style={style}>
      <span className="ledger-section__title">{t(SECTION_LABEL_KEYS[section])}</span>
      <span className="ledger-section__count">{repos.length}</span>
      {section === "behind" && skipped > 0 ? (
        <span className="ledger-section__note">
          {t("skippedDirtyCount", { count: skipped })}
        </span>
      ) : null}
      {section === "behind" && ready.length > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="signal"
          className="ml-auto"
          disabled={busy}
          onClick={() =>
            onBatch(
              "update",
              ready.map((repo) => repo.path),
            )
          }
        >
          <ArrowDownToLineIcon />
          {t("fastForwardCount", { count: ready.length })}
        </Button>
      ) : null}
      {section === "error" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={busy}
          onClick={() =>
            onBatch(
              "fetch",
              repos.map((repo) => repo.path),
            )
          }
        >
          <RefreshCwIcon />
          {t("retryFetch")}
        </Button>
      ) : null}
    </div>
  );
});

const SortableRepoRow = memo(function SortableRepoRow({
  repo,
  selected,
  arrived,
  canReorder,
  onToggle,
  onOpenDetail,
  style,
}: {
  repo: RepoStatus;
  selected: boolean;
  arrived: boolean;
  canReorder: boolean;
  onToggle: (path: string) => void;
  onOpenDetail: (repo: RepoStatus) => void;
  style?: CSSProperties;
}) {
  const { t } = useI18n();
  const { progress } = useAppUi();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: repo.path, disabled: !canReorder });

  const sortableStyle: CSSProperties = canReorder
    ? {
        transform: CSS.Transform.toString(transform),
        // Only animate while displaced; clearing transform without transition
        // avoids siblings snapping back through old slots on drop.
        transition: transform ? transition : undefined,
      }
    : {};

  return (
    <div
      ref={setNodeRef}
      role="listitem"
      data-repo-path={repo.path}
      data-selected={selected}
      data-arrived={arrived || undefined}
      className={cn("repo-row", isDragging && "is-dragging")}
      style={{ ...style, ...sortableStyle }}
      onClick={(e) => {
        if (isDragging) return;
        const target = e.target as HTMLElement;
        if (target.closest("button, input, a, label, [data-slot='checkbox']")) return;
        onOpenDetail(repo);
      }}
    >
      <RepoRowBody
        repo={repo}
        progress={progress[repo.path]}
        selected={selected}
        onToggle={onToggle}
        onOpen={onOpenDetail}
      />
      {canReorder ? (
        <button
          type="button"
          className="repo-row__grip"
          aria-label={t("reorder")}
          title={t("reorder")}
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVerticalIcon />
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  );
});
