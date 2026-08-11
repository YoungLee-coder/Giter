import { memo, useMemo, type CSSProperties } from "react";
import {
  DndContext,
  closestCenter,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FolderGit2Icon, GripVerticalIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { RepoCardBody } from "@/components/repo/RepoCard";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useAppUi } from "@/hooks/AppUiProvider";
import { useI18n } from "@/hooks/useI18n";
import { useRepoDragSort } from "@/hooks/useRepoDragSort";
import type { RepoStatus } from "@/lib/tauri";
import { cn } from "@/lib/utils";

const VIRTUALIZE_THRESHOLD = 48;
const MIN_CARD_WIDTH = 280;
const GRID_GAP = 12;
const ESTIMATED_ROW_HEIGHT = 132;

type GridProps = {
  repos: RepoStatus[];
  selected: Set<string>;
  onToggle: (path: string) => void;
  onOpenDetail: (repo: RepoStatus) => void;
  onReorder: (paths: string[]) => void;
};

export function RepoGrid({
  repos,
  selected,
  onToggle,
  onOpenDetail,
  onReorder,
}: GridProps) {
  const { t } = useI18n();
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const [dragPhase, setDragPhase] = useState<"idle" | "dragging" | "settling">("idle");
  const { sensors, itemIds, handleDragEnd } = useRepoDragSort(repos, onReorder);

  const columns = useMemo(() => {
    if (gridWidth <= 0) return 1;
    return Math.max(1, Math.floor((gridWidth + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP)));
  }, [gridWidth]);

  const rowCount = Math.ceil(repos.length / columns);
  const isReordering = dragPhase !== "idle";
  const shouldVirtualize = dragPhase === "idle" && repos.length >= VIRTUALIZE_THRESHOLD;
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

  if (!showGrid) {
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
    <SortableRepoCard
      key={repo.path}
      repo={repo}
      selected={selected.has(repo.path)}
      onToggle={onToggle}
      onOpenDetail={onOpenDetail}
      disableDrag={shouldVirtualize}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => setDragPhase("dragging")}
        onDragCancel={() => setDragPhase("idle")}
        onDragEnd={(event) => {
          const { active, over } = event;
          // flushSync: paint the new DOM order before dnd-kit clears transforms.
          if (over && active.id !== over.id) {
            flushSync(() => handleDragEnd(event));
          }
          // Hold non-virtual layout for two frames so order settles before
          // switching back to the virtualized absolute-position grid.
          setDragPhase("settling");
          requestAnimationFrame(() => {
            requestAnimationFrame(() => setDragPhase("idle"));
          });
        }}
      >
        <SortableContext items={itemIds} strategy={rectSortingStrategy}>
          {shouldVirtualize ? (
            <div
              ref={gridRef}
              className={cn("repo-grid relative w-full", isReordering && "is-reordering")}
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const start = virtualRow.index * columns;
                const rowRepos = repos.slice(start, start + columns);
                return (
                  <div
                    key={virtualRow.key}
                    className="absolute left-0 grid w-full"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                      gap: GRID_GAP,
                    }}
                  >
                    {rowRepos.map((repo) => renderCard(repo))}
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              ref={gridRef}
              role="list"
              className={cn("repo-grid grid w-full", isReordering && "is-reordering")}
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: GRID_GAP,
              }}
            >
              {repos.map((repo) => renderCard(repo))}
            </div>
          )}
        </SortableContext>
      </DndContext>
    </div>
  );
}

const SortableRepoCard = memo(function SortableRepoCard({
  repo,
  selected,
  onToggle,
  onOpenDetail,
  disableDrag,
}: {
  repo: RepoStatus;
  selected: boolean;
  onToggle: (path: string) => void;
  onOpenDetail: (repo: RepoStatus) => void;
  disableDrag: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: repo.path,
    disabled: disableDrag,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    // Only animate while displaced; clearing transform without transition
    // avoids siblings snapping back through old grid slots on drop.
    transition: transform ? transition : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "relative z-10")}>
      <RepoSortableCard
        repo={repo}
        selected={selected}
        isDragging={isDragging}
        onToggle={onToggle}
        onOpenDetail={onOpenDetail}
        dragHandleProps={
          disableDrag
            ? undefined
            : { attributes, listeners, isDragging }
        }
      />
    </div>
  );
});

function RepoSortableCard({
  repo,
  selected,
  isDragging,
  onToggle,
  onOpenDetail,
  dragHandleProps,
}: {
  repo: RepoStatus;
  selected: boolean;
  isDragging: boolean;
  onToggle: (path: string) => void;
  onOpenDetail: (repo: RepoStatus) => void;
  dragHandleProps?: {
    attributes: DraggableAttributes;
    listeners: DraggableSyntheticListeners;
    isDragging: boolean;
  };
}) {
  const { progress } = useAppUi();
  const repoProgress = progress[repo.path];

  return (
    <div role="listitem" data-repo-path={repo.path} className="repo-card-slot min-w-0">
      <Card
        size="sm"
        className={cn(
          "repo-card h-full cursor-pointer gap-0 border bg-card py-0",
          selected && !isDragging && "is-selected",
          // In-place drag (cc-switch): keep the card visible — no opacity ghost /
          // DragOverlay handoff that flashes on drop.
          isDragging && "is-dragging cursor-grabbing shadow-lg",
        )}
        onClick={(e) => {
          if (isDragging) return;
          const target = e.target as HTMLElement;
          if (target.closest("button, input, a, label, [data-slot='checkbox']")) {
            return;
          }
          onOpenDetail(repo);
        }}
      >
        <div className="relative">
          {dragHandleProps && (
            <button
              type="button"
              className={cn(
                "absolute top-2 right-2 z-10 rounded-md p-1 text-muted-foreground/50 transition-colors hover:text-muted-foreground",
                dragHandleProps.isDragging && "cursor-grabbing text-muted-foreground",
              )}
              aria-label="Reorder"
              {...dragHandleProps.attributes}
              {...dragHandleProps.listeners}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVerticalIcon className="size-4" />
            </button>
          )}
          <RepoCardBody
            repo={repo}
            progress={repoProgress}
            selected={selected}
            onToggle={onToggle}
          />
        </div>
      </Card>
    </div>
  );
}
