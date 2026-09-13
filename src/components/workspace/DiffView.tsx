import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import type { DiffHunk, DiffLine, FileDiff, HunkLineInput } from "@/lib/tauri";

type Props = {
  diff: FileDiff | null;
  staged: boolean;
  busy: boolean;
  onApply: (hunk: DiffHunk, lines: HunkLineInput[], reverse: boolean) => void;
};

type HunkRow = {
  line: DiffLine;
  oldNo: number | null;
  newNo: number | null;
};

function hunkRows(hunk: DiffHunk): HunkRow[] {
  let oldNo = hunk.oldStart;
  let newNo = hunk.newStart;
  return hunk.lines.map((line) => {
    const row: HunkRow = {
      line,
      oldNo: line.kind === "add" ? null : oldNo,
      newNo: line.kind === "del" ? null : newNo,
    };
    if (line.kind !== "add") oldNo += 1;
    if (line.kind !== "del") newNo += 1;
    return row;
  });
}

function hunkStat(hunk: DiffHunk): { add: number; del: number } {
  let add = 0;
  let del = 0;
  for (const line of hunk.lines) {
    if (line.kind === "add") add += 1;
    else if (line.kind === "del") del += 1;
  }
  return { add, del };
}

// The diff pane is preview-only: hunks are applied as a whole, so every
// changed line within a hunk is passed to the backend already selected.
function hunkInput(hunk: DiffHunk): HunkLineInput[] {
  return hunk.lines.map((line) => ({
    kind: line.kind,
    text: line.text,
    selected: line.kind === "add" || line.kind === "del",
  }));
}

export function DiffView({ diff, staged, busy, onApply }: Props) {
  const { t } = useI18n();
  if (!diff) {
    return <p className="p-4 text-sm text-muted-foreground">{t("workspaceNoChanges")}</p>;
  }
  if (diff.binary) {
    return <p className="p-4 text-sm text-muted-foreground">{t("workspaceBinary")}</p>;
  }
  if (diff.hunks.length === 0) {
    return (
      <p className="p-4 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
        {diff.header}
      </p>
    );
  }
  return (
    <div className="workspace-diff">
      {diff.hunks.map((hunk) => (
        <HunkBlock
          key={hunk.header}
          hunk={hunk}
          staged={staged}
          busy={busy}
          onApply={() => onApply(hunk, hunkInput(hunk), staged)}
        />
      ))}
    </div>
  );
}

function HunkBlock({
  hunk,
  staged,
  busy,
  onApply,
}: {
  hunk: DiffHunk;
  staged: boolean;
  busy: boolean;
  onApply: () => void;
}) {
  const { t } = useI18n();
  const rows = useMemo(() => hunkRows(hunk), [hunk]);
  const stat = useMemo(() => hunkStat(hunk), [hunk]);

  return (
    <section className="workspace-hunk">
      <div className="workspace-hunk__head">
        <span className="workspace-hunk__header" title={hunk.header}>
          {hunk.header}
        </span>
        <span className="workspace-hunk__stat">
          <span className="workspace-hunk__stat--add">+{stat.add}</span>{" "}
          <span className="workspace-hunk__stat--del">−{stat.del}</span>
        </span>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={busy || stat.add + stat.del === 0}
          onClick={onApply}
        >
          {staged ? t("workspaceUnstageHunk") : t("workspaceStageHunk")}
        </Button>
      </div>
      <div className="workspace-diff__body">
        {rows.map((row, i) => (
          <DiffLineRow key={`${hunk.header}-${i}`} row={row} />
        ))}
      </div>
    </section>
  );
}

function DiffLineRow({ row }: { row: HunkRow }) {
  const { line, oldNo, newNo } = row;
  return (
    <div
      className={cn(
        "workspace-diff-line",
        line.kind === "add" && "workspace-diff-line--add",
        line.kind === "del" && "workspace-diff-line--del",
      )}
    >
      <span className="workspace-diff-line__num">{oldNo ?? ""}</span>
      <span className="workspace-diff-line__num">{newNo ?? ""}</span>
      <span className="workspace-diff-line__sign">
        {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}
      </span>
      <span className="workspace-diff-line__text">{line.text || " "}</span>
    </div>
  );
}
