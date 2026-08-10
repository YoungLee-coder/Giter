import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { animate, motion, useMotionValue } from "framer-motion";
import { FolderGit2Icon } from "lucide-react";
import { RepoCardBody, RepoGridCard } from "@/components/repo/RepoCard";
import {
  type DragSession,
  EASING,
  FLIP_MS,
  LONG_PRESS_MS,
  MOVE_CANCEL_PX,
  captureCardRects,
  indexAtGridPoint,
  measureGridLayout,
  movePath,
  prefersReducedMotion,
  type GridLayoutMetrics,
} from "@/components/repo/repoDrag";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useI18n } from "@/i18n";
import { FM_TRANSITION } from "@/lib/motion";
import type { RepoStatus } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/appStore";
import { useRepoGridStore } from "@/stores/repoGridStore";

const VIRTUALIZE_THRESHOLD = 48;
const MIN_CARD_WIDTH = 280;
const GRID_GAP = 12;
const ESTIMATED_ROW_HEIGHT = 132;

type GridProps = {
  repos: RepoStatus[];
  selected: Set<string>;
  onToggle: (path: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onOpenDetail: (repo: RepoStatus) => void;
  onReorder: (paths: string[]) => void;
};

export function RepoGrid({
  repos,
  selected,
  onToggle,
  onSelectAll,
  onClearSelection,
  onOpenDetail,
  onReorder,
}: GridProps) {
  const { t } = useI18n();
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement | null>(null);
  const suppressClickRef = useRef(false);
  const dragRef = useRef<DragSession | null>(null);
  const orderRef = useRef<string[] | null>(null);
  const prevRectsRef = useRef<Map<string, DOMRect> | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const layoutMetricsRef = useRef<GridLayoutMetrics | null>(null);
  const orderRafRef = useRef(0);
  const pendingOrderRef = useRef<string[] | null>(null);
  const [gridWidth, setGridWidth] = useState(0);

  const floatX = useMotionValue(0);
  const floatY = useMotionValue(0);

  const draggingPath = useRepoGridStore((s) => s.draggingPath);
  const pressingPath = useRepoGridStore((s) => s.pressingPath);
  const orderedPaths = useRepoGridStore((s) => s.orderedPaths);
  const floatMetrics = useRepoGridStore((s) => s.floatMetrics);
  const setDraggingPath = useRepoGridStore((s) => s.setDraggingPath);
  const setPressingPath = useRepoGridStore((s) => s.setPressingPath);
  const setOrderedPaths = useRepoGridStore((s) => s.setOrderedPaths);
  const clearDragVisualsStore = useRepoGridStore((s) => s.clearDragVisuals);
  const allSelected = repos.length > 0 && selected.size === repos.length;
  const someSelected = selected.size > 0 && !allSelected;

  const displayRepos = useMemo(() => {
    if (!orderedPaths) return repos;
    const byPath = new Map(repos.map((r) => [r.path, r]));
    return orderedPaths
      .map((path) => byPath.get(path))
      .filter((r): r is RepoStatus => r != null);
  }, [repos, orderedPaths]);

  const columns = useMemo(() => {
    if (gridWidth <= 0) return 1;
    return Math.max(1, Math.floor((gridWidth + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP)));
  }, [gridWidth]);

  const rowCount = Math.ceil(displayRepos.length / columns);
  const shouldVirtualize =
    !draggingPath && displayRepos.length >= VIRTUALIZE_THRESHOLD;

  const showGrid = repos.length > 0;

  useEffect(() => {
    if (!showGrid) return;
    const grid = gridRef.current;
    if (!grid) return;
    scrollRef.current = grid.closest(".giter-scroll") as HTMLElement | null;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setGridWidth(w);
    });
    ro.observe(grid);
    setGridWidth(grid.clientWidth);
    return () => ro.disconnect();
  }, [showGrid]);

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? rowCount : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 4,
  });

  useEffect(() => {
    if (dragRef.current || !orderedPaths) return;
    const synced =
      orderedPaths.length === repos.length &&
      orderedPaths.every((path, i) => path === repos[i]?.path);
    if (synced) {
      setOrderedPaths(null);
      orderRef.current = null;
    }
  }, [repos, orderedPaths, setOrderedPaths]);

  // Sibling slides: manual FLIP on [data-repo-path] slots (not FM layout).
  useLayoutEffect(() => {
    const prev = prevRectsRef.current;
    prevRectsRef.current = null;
    const grid = gridRef.current;
    if (!prev || !grid || !draggingPath || prefersReducedMotion()) return;

    const nextRects = captureCardRects(grid);
    for (const [path, nextRect] of nextRects) {
      if (path === draggingPath) continue;
      const prevRect = prev.get(path);
      if (!prevRect) continue;
      const dx = prevRect.left - nextRect.left;
      const dy = prevRect.top - nextRect.top;
      if (dx === 0 && dy === 0) continue;

      const el = grid.querySelector<HTMLElement>(
        `[data-repo-path="${CSS.escape(path)}"]`,
      );
      if (!el) continue;

      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      void el.offsetWidth;
      el.style.transition = `transform ${FLIP_MS}ms ${EASING}`;
      el.style.transform = "";

      const clear = () => {
        el.style.transition = "";
        el.style.transform = "";
        el.removeEventListener("transitionend", clear);
      };
      el.addEventListener("transitionend", clear);
    }
  }, [orderedPaths, draggingPath]);

  const draggingRepo = draggingPath
    ? (displayRepos.find((r) => r.path === draggingPath) ?? null)
    : null;

  const scheduleOrderedPaths = (next: string[]) => {
    pendingOrderRef.current = next;
    if (orderRafRef.current) return;
    orderRafRef.current = requestAnimationFrame(() => {
      orderRafRef.current = 0;
      const pending = pendingOrderRef.current;
      pendingOrderRef.current = null;
      if (pending) setOrderedPaths(pending);
    });
  };

  const positionFloat = (x: number, y: number) => {
    floatX.set(x);
    floatY.set(y);
  };

  useLayoutEffect(() => {
    if (!floatMetrics) return;
    floatX.set(floatMetrics.x);
    floatY.set(floatMetrics.y);
  }, [floatMetrics, floatX, floatY]);

  const clearDragVisuals = () => {
    clearDragVisualsStore();
    const grid = gridRef.current;
    if (!grid) return;
    grid.querySelectorAll<HTMLElement>("[data-repo-path]").forEach((el) => {
      el.style.transition = "";
      el.style.transform = "";
    });
  };

  const finishDrag = (commit: boolean) => {
    const session = dragRef.current;
    const nextOrder = orderRef.current;
    dragRef.current = null;
    layoutMetricsRef.current = null;
    if (orderRafRef.current) {
      cancelAnimationFrame(orderRafRef.current);
      orderRafRef.current = 0;
    }
    pendingOrderRef.current = null;

    const changed =
      !!session?.active &&
      !!nextOrder &&
      nextOrder.some((path, i) => path !== session.originOrder[i]);

    clearDragVisuals();

    if (commit && changed && nextOrder) {
      onReorder(nextOrder);
      return;
    }

    orderRef.current = null;
    setOrderedPaths(null);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const activateDrag = (session: DragSession, clientX: number, clientY: number) => {
    const slot = gridRef.current?.querySelector<HTMLElement>(
      `[data-repo-path="${CSS.escape(session.path)}"]`,
    );
    const card =
      slot?.querySelector<HTMLElement>(":scope > .repo-card") ?? slot;
    if (!card || !gridRef.current) return;

    const rect = card.getBoundingClientRect();
    session.active = true;
    session.grabOffsetX = clientX - rect.left;
    session.grabOffsetY = clientY - rect.top;
    suppressClickRef.current = true;

    layoutMetricsRef.current = measureGridLayout(
      gridRef.current,
      columns,
      GRID_GAP,
      displayRepos.length,
    );

    const initial = [...session.originOrder];
    orderRef.current = initial;

    // Float first (same frame coords), then mark dragging — avoids a blank gap
    // where the grid card is emptied before the float exists.
    floatX.set(rect.left);
    floatY.set(rect.top);
    useRepoGridStore.setState({
      pressingPath: null,
      orderedPaths: initial,
      draggingPath: session.path,
      floatMetrics: {
        path: session.path,
        width: rect.width,
        height: rect.height,
        x: rect.left,
        y: rect.top,
      },
    });
  };

  const settleAndFinish = async () => {
    const session = dragRef.current;
    if (!session?.active) {
      finishDrag(false);
      return;
    }

    session.settling = true;
    const placeholderSlot = gridRef.current?.querySelector<HTMLElement>(
      `[data-repo-path="${CSS.escape(session.path)}"]`,
    );
    const placeholder =
      placeholderSlot?.querySelector<HTMLElement>(":scope > .repo-card") ??
      placeholderSlot;

    if (placeholder && !prefersReducedMotion()) {
      const target = placeholder.getBoundingClientRect();
      await Promise.all([
        animate(floatX, target.left, FM_TRANSITION.floatDrop),
        animate(floatY, target.top, FM_TRANSITION.floatDrop),
      ]);
    } else if (placeholder) {
      const target = placeholder.getBoundingClientRect();
      floatX.set(target.left);
      floatY.set(target.top);
    }

    // Reveal the grid card under the float while the float still covers it,
    // then drop the float next frame — prevents end-of-drag pop/flicker.
    setDraggingPath(null);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    const nextOrder = orderRef.current;
    const changed =
      !!nextOrder &&
      nextOrder.some((path, i) => path !== session.originOrder[i]);

    dragRef.current = null;
    layoutMetricsRef.current = null;
    if (orderRafRef.current) {
      cancelAnimationFrame(orderRafRef.current);
      orderRafRef.current = 0;
    }
    pendingOrderRef.current = null;
    clearDragVisuals();

    if (changed && nextOrder) {
      onReorder(nextOrder);
      return;
    }

    orderRef.current = null;
    setOrderedPaths(null);
  };

  const shouldIgnoreClick = () => suppressClickRef.current;

  const onCardPointerDown = (
    repo: RepoStatus,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, a, label, [data-slot='checkbox']")) return;

    clearLongPressTimer();
    setPressingPath(repo.path);

    dragRef.current = {
      path: repo.path,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      settling: false,
      originOrder: repos.map((r) => r.path),
      grabOffsetX: 0,
      grabOffsetY: 0,
    };

    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      const session = dragRef.current;
      if (!session || session.active || session.settling) return;
      activateDrag(session, session.startX, session.startY);
    }, LONG_PRESS_MS);

    const onMove = (moveEvent: PointerEvent) => {
      const session = dragRef.current;
      if (!session || moveEvent.pointerId !== session.pointerId || session.settling) {
        return;
      }

      const dx = moveEvent.clientX - session.startX;
      const dy = moveEvent.clientY - session.startY;

      if (!session.active) {
        if (dx * dx + dy * dy >= MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
          clearLongPressTimer();
          setPressingPath(null);
          dragRef.current = null;
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);
        }
        return;
      }

      positionFloat(
        moveEvent.clientX - session.grabOffsetX,
        moveEvent.clientY - session.grabOffsetY,
      );

      const metrics = layoutMetricsRef.current;
      const overIndex = metrics
        ? indexAtGridPoint(moveEvent.clientX, moveEvent.clientY, metrics)
        : null;
      if (overIndex == null) return;

      const current = orderRef.current ?? session.originOrder;
      const from = current.indexOf(session.path);
      if (from < 0 || from === overIndex) return;

      if (gridRef.current) {
        prevRectsRef.current = captureCardRects(gridRef.current);
      }
      const next = movePath(current, from, overIndex);
      orderRef.current = next;
      scheduleOrderedPaths(next);
    };

    const onUp = (upEvent: PointerEvent) => {
      const session = dragRef.current;
      if (!session || upEvent.pointerId !== session.pointerId) return;
      clearLongPressTimer();
      setPressingPath(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      if (!session.active) {
        dragRef.current = null;
        return;
      }

      void settleAndFinish().finally(() => {
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  if (repos.length === 0) {
    return (
      <Empty className="h-full justify-center border-0 bg-transparent py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-muted/60 text-muted-foreground">
            <FolderGit2Icon />
          </EmptyMedia>
          <EmptyTitle className="text-sm font-medium">{t("emptyTitle")}</EmptyTitle>
          <EmptyDescription className="text-xs">{t("emptyHint")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const renderCard = (repo: RepoStatus) => (
    <RepoGridCard
      key={repo.path}
      repo={repo}
      selected={selected.has(repo.path)}
      isDragging={draggingPath === repo.path}
      isPressing={pressingPath === repo.path}
      onToggle={onToggle}
      onOpenDetail={onOpenDetail}
      onPointerDown={onCardPointerDown}
      shouldIgnoreClick={shouldIgnoreClick}
    />
  );

  return (
    <div className="flex flex-col gap-2 px-0.5">
      <div className="flex items-center gap-1.5">
        <Checkbox
          checked={allSelected ? true : someSelected ? "indeterminate" : false}
          onCheckedChange={() => {
            if (allSelected) onClearSelection();
            else onSelectAll();
          }}
          aria-label={t("selectAll")}
        />
        <span className="text-xs text-muted-foreground">{t("selectAll")}</span>
      </div>

      {shouldVirtualize ? (
        <div
          ref={gridRef}
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
          role="list"
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const start = virtualRow.index * columns;
            const rowRepos = displayRepos.slice(start, start + columns);
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 w-full"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
                  className="repo-grid grid gap-3"
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  }}
                >
                  {rowRepos.map((repo) => renderCard(repo))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className={cn(
            "repo-grid grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3",
            draggingPath && "is-reordering",
          )}
          role="list"
          ref={gridRef}
        >
          {displayRepos.map((repo) => renderCard(repo))}
        </div>
      )}

      {draggingRepo && floatMetrics && (
        <FloatCard
          repo={draggingRepo}
          selected={selected.has(draggingRepo.path)}
          width={floatMetrics.width}
          height={floatMetrics.height}
          x={floatX}
          y={floatY}
          onToggle={onToggle}
        />
      )}
    </div>
  );
}

const FloatCard = memo(function FloatCard({
  repo,
  selected,
  width,
  height,
  x,
  y,
  onToggle,
}: {
  repo: RepoStatus;
  selected: boolean;
  width: number;
  height: number;
  x: ReturnType<typeof useMotionValue<number>>;
  y: ReturnType<typeof useMotionValue<number>>;
  onToggle: (path: string) => void;
}) {
  const progress = useAppStore((s) => s.progress[repo.path]);
  return (
    <motion.div
      className="repo-card--float"
      style={{
        width,
        height,
        x,
        y,
      }}
      transformTemplate={({ x: tx, y: ty }) =>
        `translate3d(${tx ?? 0}, ${ty ?? 0}, 0)`
      }
      aria-hidden
    >
      <Card
        size="sm"
        className={cn(
          "repo-card repo-card--lifted h-full w-full gap-0 border bg-card py-0",
          selected && "is-selected",
        )}
      >
        <RepoCardBody
          repo={repo}
          progress={progress}
          selected={selected}
          onToggle={onToggle}
        />
      </Card>
    </motion.div>
  );
});
