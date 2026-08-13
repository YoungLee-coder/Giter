export type GraphLine = {
  from: number;
  to: number;
  colorIndex: number;
  fromMid?: boolean;
  toMid?: boolean;
};

export type GraphRow<T extends { hash: string; parents: string[] }> = {
  commit: T;
  column: number;
  colorIndex: number;
  lines: GraphLine[];
  laneCount: number;
};

type Lane = { hash: string; colorIndex: number };

export function layoutCommitGraph<T extends { hash: string; parents: string[] }>(
  commits: T[],
): GraphRow<T>[] {
  const lanes: (Lane | null)[] = [];
  let nextColor = 0;
  const rows: GraphRow<T>[] = [];

  const allocColor = () => {
    const color = nextColor;
    nextColor += 1;
    return color;
  };

  const findHash = (hash: string) => lanes.findIndex((lane) => lane?.hash === hash);

  const occupy = (hash: string, colorIndex: number): number => {
    const existing = findHash(hash);
    if (existing >= 0) return existing;
    const empty = lanes.findIndex((lane) => lane === null);
    if (empty >= 0) {
      lanes[empty] = { hash, colorIndex };
      return empty;
    }
    lanes.push({ hash, colorIndex });
    return lanes.length - 1;
  };

  for (const commit of commits) {
    const existingCol = findHash(commit.hash);
    const appeared = existingCol < 0;
    let column = existingCol;
    let colorIndex: number;
    if (column < 0) {
      colorIndex = allocColor();
      column = occupy(commit.hash, colorIndex);
    } else {
      colorIndex = lanes[column]!.colorIndex;
    }

    const current = lanes.map((lane) => lane);
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i]?.hash === commit.hash) {
        lanes[i] = null;
      }
    }

    const parents = commit.parents.filter(Boolean);
    if (parents.length > 0) {
      // First parent stays in this column so the left rail is the first-parent chain.
      lanes[column] = { hash: parents[0], colorIndex };
      for (const parent of parents.slice(1)) {
        if (findHash(parent) < 0) {
          occupy(parent, allocColor());
        }
      }
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop();
    }

    const lines: GraphLine[] = [];
    for (let i = 0; i < current.length; i++) {
      const lane = current[i];
      if (!lane) continue;

      if (lane.hash === commit.hash) {
        if (i === column) {
          if (parents.length === 0) {
            if (!appeared) {
              lines.push({
                from: i,
                to: column,
                colorIndex,
                toMid: true,
              });
            }
          } else {
            parents.forEach((parent, parentIndex) => {
              let to = column;
              if (parentIndex > 0) {
                const found = lanes.findIndex((next) => next?.hash === parent);
                if (found >= 0) to = found;
              }
              const mergeColor =
                parentIndex === 0
                  ? colorIndex
                  : (lanes[to]?.colorIndex ?? lane.colorIndex);
              lines.push({
                from: i,
                to,
                colorIndex: mergeColor,
                ...(appeared ? { fromMid: true } : {}),
              });
            });
          }
        } else {
          lines.push({
            from: i,
            to: column,
            colorIndex: lane.colorIndex,
            toMid: true,
          });
        }
      } else {
        const to = lanes.findIndex((next) => next?.hash === lane.hash);
        lines.push({
          from: i,
          to: to >= 0 ? to : i,
          colorIndex: lane.colorIndex,
        });
      }
    }

    const laneCount = Math.max(
      current.length,
      lanes.length,
      column + 1,
      ...lines.map((line) => Math.max(line.from, line.to) + 1),
      1,
    );

    rows.push({ commit, column, colorIndex, lines, laneCount });
  }

  return rows;
}

export const LANE_COLORS = [
  "var(--run)",
  "var(--ok)",
  "var(--warn)",
  "var(--lane-violet)",
  "var(--lane-teal)",
  "var(--lane-coral)",
  "var(--lane-slate)",
  "var(--primary)",
] as const;

export function laneColor(colorIndex: number): string {
  return LANE_COLORS[colorIndex % LANE_COLORS.length];
}

export type GraphEdge = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  colorIndex: number;
};

export type NodeGeom = {
  nodeY: number;
  bottom: number;
};

/** Node-to-node links so lanes are not sliced at row boundaries. */
export function commitGraphEdges(
  rows: GraphRow<{ hash: string; parents: string[] }>[],
  geoms: NodeGeom[],
  colW: number,
): GraphEdge[] {
  const byHash = new Map<string, number>();
  rows.forEach((row, index) => byHash.set(row.commit.hash, index));
  const x = (column: number) => column * colW + colW / 2;
  const lastBottom = geoms[geoms.length - 1]?.bottom ?? 0;
  const edges: GraphEdge[] = [];

  rows.forEach((row, index) => {
    const geom = geoms[index];
    if (!geom) return;
    const parents = row.commit.parents.filter(Boolean);
    if (parents.length === 0) return;

    const outgoing = row.lines.filter((line) => line.from === row.column);
    parents.forEach((parent, parentIndex) => {
      const line = outgoing[parentIndex];
      const colorIndex = line?.colorIndex ?? row.colorIndex;
      const targetIndex = byHash.get(parent);
      const targetGeom = targetIndex !== undefined ? geoms[targetIndex] : undefined;
      const x1 = x(row.column);
      const y1 = geom.nodeY;
      if (targetIndex !== undefined && targetGeom) {
        edges.push({
          x1,
          y1,
          x2: x(rows[targetIndex].column),
          y2: targetGeom.nodeY,
          colorIndex,
        });
        return;
      }
      edges.push({
        x1,
        y1,
        x2: x(line?.to ?? row.column),
        y2: lastBottom,
        colorIndex,
      });
    });
  });

  return edges;
}

/**
 * IDE-style git graph: vertical rails, circular 90° elbows when changing lanes.
 * Branch out just below the child; merge in just above the parent.
 */
export function nodeLinkPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(dx) < 0.5) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const sy = dy >= 0 ? 1 : -1;
  const r = Math.min(adx / 2, ady / 2);
  if (r < 1) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  const k = r * 0.5522847498;
  const midX = (x1 + x2) / 2;

  if (dx > 0) {
    const yMid = y1 + sy * r;
    const yEnd = y1 + sy * 2 * r;
    const arc = `C ${x1} ${y1 + sy * k}, ${midX - k} ${yMid}, ${midX} ${yMid} C ${midX + k} ${yMid}, ${x2} ${yMid + sy * k}, ${x2} ${yEnd}`;
    if (Math.abs(y2 - yEnd) < 0.5) {
      return `M ${x1} ${y1} ${arc}`;
    }
    return `M ${x1} ${y1} ${arc} L ${x2} ${y2}`;
  }

  const yMid = y2 - sy * r;
  const yStart = y2 - sy * 2 * r;
  const arc = `C ${x1} ${yStart + sy * k}, ${midX + k} ${yMid}, ${midX} ${yMid} C ${midX - k} ${yMid}, ${x2} ${yMid + sy * k}, ${x2} ${y2}`;
  if (Math.abs(yStart - y1) < 0.5) {
    return `M ${x1} ${y1} ${arc}`;
  }
  return `M ${x1} ${y1} L ${x1} ${yStart} ${arc}`;
}
