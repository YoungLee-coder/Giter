import { MOTION_EASING, MOTION_MS } from "@/lib/motion";

export type DragSession = {
  path: string;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  settling: boolean;
  originOrder: string[];
  grabOffsetX: number;
  grabOffsetY: number;
};

export type GridLayoutMetrics = {
  left: number;
  top: number;
  columns: number;
  gap: number;
  cellWidth: number;
  cellHeight: number;
  count: number;
};

export const MOVE_CANCEL_PX = 8;
export const LONG_PRESS_MS = 420;
/** @deprecated Prefer FM float springs — FLIP still used for sibling grid slides. */
export const FLIP_MS = MOTION_MS.flip;
export const DROP_MS = MOTION_MS.drop;
export const EASING = MOTION_EASING.out;

let reducedMotionCached: boolean | null = null;
let reducedMotionMq: MediaQueryList | null = null;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (!reducedMotionMq) {
    reducedMotionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionCached = reducedMotionMq.matches;
    reducedMotionMq.addEventListener("change", (e) => {
      reducedMotionCached = e.matches;
    });
  }
  return reducedMotionCached ?? false;
}

export function movePath(paths: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= paths.length || to >= paths.length) {
    return paths;
  }
  const next = [...paths];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function captureCardRects(grid: HTMLElement): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  grid.querySelectorAll<HTMLElement>("[data-repo-path]").forEach((el) => {
    const path = el.dataset.repoPath;
    if (path) map.set(path, el.getBoundingClientRect());
  });
  return map;
}

export function measureGridLayout(
  grid: HTMLElement,
  columns: number,
  gap: number,
  count: number,
): GridLayoutMetrics {
  const gridRect = grid.getBoundingClientRect();
  const first = grid.querySelector<HTMLElement>("[data-repo-path]");
  const firstRect = first?.getBoundingClientRect();
  const cellWidth =
    firstRect?.width ??
    Math.max(1, (gridRect.width - gap * Math.max(0, columns - 1)) / columns);
  const cellHeight = firstRect?.height ?? 110;
  return {
    left: gridRect.left,
    top: gridRect.top,
    columns: Math.max(1, columns),
    gap,
    cellWidth,
    cellHeight,
    count,
  };
}

/** Hit-test without per-move getBoundingClientRect on every card. */
export function indexAtGridPoint(
  clientX: number,
  clientY: number,
  metrics: GridLayoutMetrics,
): number | null {
  const { left, top, columns, gap, cellWidth, cellHeight, count } = metrics;
  if (count === 0) return null;
  const x = clientX - left;
  const y = clientY - top;
  if (x < 0 || y < 0) return null;

  const col = Math.floor(x / (cellWidth + gap));
  const row = Math.floor(y / (cellHeight + gap));
  if (col < 0 || col >= columns || row < 0) return null;

  const index = row * columns + col;
  if (index < 0 || index >= count) return null;

  const localX = x - col * (cellWidth + gap);
  const localY = y - row * (cellHeight + gap);
  if (localX > cellWidth || localY > cellHeight) return null;

  return index;
}
