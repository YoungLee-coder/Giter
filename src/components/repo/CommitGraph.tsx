import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/hooks/useI18n";
import {
  commitGraphEdges,
  laneColor,
  layoutCommitGraph,
  nodeLinkPath,
  type GraphRow,
} from "@/lib/commitGraph";
import type { CommitInfo, CommitRef } from "@/lib/tauri";
import { cn } from "@/lib/utils";

const COL_W = 18;
/** Node sits on the title line, as a fraction of row height. */
const NODE_Y_RATIO = 0.3;

const KIND_ORDER: Record<string, number> = {
  head: 0,
  local: 1,
  tag: 2,
  remote: 3,
};

type RowGeom = {
  nodeY: number;
  bottom: number;
};

type Props = {
  commits: CommitInfo[];
  formatDate: (iso: string) => string;
};

export function CommitGraph({ commits, formatDate }: Props) {
  const { t } = useI18n();
  const rows = useMemo(() => layoutCommitGraph(commits), [commits]);
  const maxCols = Math.max(1, ...rows.map((row) => row.laneCount));
  const graphW = maxCols * COL_W;
  const listRef = useRef<HTMLUListElement>(null);
  const [geoms, setGeoms] = useState<RowGeom[]>([]);
  const [overlayH, setOverlayH] = useState(0);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const items = list.querySelectorAll<HTMLElement>(".commit-graph__row");
      const next: RowGeom[] = [];
      items.forEach((item) => {
        const top = item.offsetTop;
        const height = item.offsetHeight;
        next.push({
          nodeY: top + height * NODE_Y_RATIO,
          bottom: top + height,
        });
      });
      setGeoms(next);
      setOverlayH(list.scrollHeight);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    list.querySelectorAll(".commit-graph__row").forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [rows]);

  const edges = useMemo(
    () => (geoms.length === rows.length ? commitGraphEdges(rows, geoms, COL_W) : []),
    [rows, geoms],
  );

  return (
    <ul
      ref={listRef}
      className="commit-graph soft-panel"
      aria-label={t("detailCommitGraph")}
    >
      {overlayH > 0 && (
        <svg
          className="commit-graph__overlay"
          width={graphW}
          height={overlayH}
          aria-hidden="true"
        >
          {edges.map((edge, index) => (
            <path
              key={index}
              d={nodeLinkPath(edge.x1, edge.y1, edge.x2, edge.y2)}
              fill="none"
              stroke={laneColor(edge.colorIndex)}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      )}
      {rows.map((row) => (
        <CommitGraphRow
          key={row.commit.hash}
          row={row}
          maxCols={maxCols}
          formatDate={formatDate}
        />
      ))}
    </ul>
  );
}

function CommitGraphRow({
  row,
  maxCols,
  formatDate,
}: {
  row: GraphRow<CommitInfo>;
  maxCols: number;
  formatDate: (iso: string) => string;
}) {
  const { commit, column, colorIndex } = row;
  const isHead = commit.refs.some((ref) => ref.kind === "head");
  const refs = visibleRefs(commit.refs);
  const color = laneColor(colorIndex);

  return (
    <li className="commit-graph__row">
      <div
        className="commit-graph__lanes"
        style={{ width: maxCols * COL_W }}
        aria-hidden="true"
      >
        <span
          className={cn("commit-graph__dot", isHead && "commit-graph__dot--head")}
          style={
            {
              left: column * COL_W + COL_W / 2,
              "--lane-color": color,
            } as CSSProperties
          }
        />
      </div>
      <div className="commit-graph__body">
        <div className="commit-graph__title">
          <p className="commit-graph__subject">{commit.subject}</p>
          {refs.length > 0 && (
            <div className="commit-graph__refs">
              {refs.map((ref) => (
                <RefChip key={`${ref.kind}:${ref.name}`} refInfo={ref} />
              ))}
            </div>
          )}
        </div>
        <p className="commit-graph__meta">
          <span className="commit-graph__hash">{commit.shortHash}</span>
          <span aria-hidden="true">·</span>
          <span>{commit.author}</span>
          <span aria-hidden="true">·</span>
          <span>{formatDate(commit.date)}</span>
        </p>
      </div>
    </li>
  );
}

function RefChip({ refInfo }: { refInfo: CommitRef }) {
  const kind = refInfo.kind;
  return (
    <Badge
      variant={kind === "head" ? "default" : kind === "local" ? "secondary" : "outline"}
      className={cn(
        "h-4 max-w-[7.5rem] min-w-0 px-1.5 text-[11px] font-medium tracking-tight",
        kind === "tag" &&
          "border-transparent bg-[color-mix(in_srgb,var(--warn)_14%,transparent)] text-[var(--warn)]",
        kind === "remote" && "border-transparent bg-transparent text-muted-foreground",
      )}
      title={refInfo.name}
    >
      <span className="truncate">{refInfo.name}</span>
    </Badge>
  );
}

function visibleRefs(refs: CommitRef[]): CommitRef[] {
  const locals = new Set(
    refs.filter((ref) => ref.kind === "local").map((ref) => ref.name),
  );
  return [...refs]
    .filter((ref) => {
      if (ref.kind !== "remote") return true;
      const slash = ref.name.indexOf("/");
      const short = slash >= 0 ? ref.name.slice(slash + 1) : ref.name;
      return !locals.has(short);
    })
    .sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
}
