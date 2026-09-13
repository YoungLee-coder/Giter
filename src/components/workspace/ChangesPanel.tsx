import { useMemo, type ReactNode } from "react";
import {
  FileTextIcon,
  InboxIcon,
  MinusIcon,
  PlusIcon,
  TriangleAlertIcon,
  Undo2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";
import { splitPath } from "@/lib/pathText";
import type { ChangedFile, DiffHunk, FileDiff, HunkLineInput } from "@/lib/tauri";
import { DiffView } from "./DiffView";

type Selected = { path: string; staged: boolean } | null;

type Props = {
  files: ChangedFile[];
  selected: Selected;
  diff: FileDiff | null;
  busy: boolean;
  stagedCount: number;
  unstagedCount: number;
  onSelect: (next: Selected) => void;
  onStage: (files: string[]) => void;
  onUnstage: (files: string[]) => void;
  onDiscard: (files: string[]) => void;
  onDiscardAll: (files: string[]) => void;
  onApplyHunk: (hunk: DiffHunk, lines: HunkLineInput[], reverse: boolean) => void;
  onConflict: (file: string, side: "ours" | "theirs") => void;
  onMarkResolved: (file: string) => void;
};

const STATUS_LABEL_KEY: Record<string, string> = {
  untracked: "workspaceStatusUntracked",
  modified: "workspaceStatusModified",
  added: "workspaceStatusAdded",
  deleted: "workspaceStatusDeleted",
  renamed: "workspaceStatusRenamed",
  copied: "workspaceStatusCopied",
  conflicted: "workspaceStatusConflicted",
};

function statusGlyph(file: ChangedFile): string {
  if (file.conflicted) return "U";
  if (file.kind === "untracked") return "?";
  return file.indexStatus !== "." ? file.indexStatus : file.worktreeStatus;
}

export function ChangesPanel({
  files,
  selected,
  diff,
  busy,
  stagedCount,
  unstagedCount,
  onSelect,
  onStage,
  onUnstage,
  onDiscard,
  onDiscardAll,
  onApplyHunk,
  onConflict,
  onMarkResolved,
}: Props) {
  const { t } = useI18n();
  const conflicts = files.filter((file) => file.conflicted);
  const staged = files.filter((file) => file.staged && !file.conflicted);
  const unstaged = files.filter(
    (file) => (file.unstaged || file.kind === "untracked") && !file.conflicted,
  );
  // `git clean` is off limits in this app — only tracked files may be discarded.
  const discardable = unstaged.filter((file) => file.kind !== "untracked");

  const selectedFile = selected
    ? files.find((file) => file.path === selected.path)
    : undefined;

  const stats = useMemo(() => {
    let add = 0;
    let del = 0;
    for (const hunk of diff?.hunks ?? []) {
      for (const line of hunk.lines) {
        if (line.kind === "add") add += 1;
        else if (line.kind === "del") del += 1;
      }
    }
    return { add, del };
  }, [diff]);

  const pathParts = selectedFile ? splitPath(selectedFile.path) : null;

  return (
    <div className="workspace-split">
      <div className="workspace-split__aside">
        <div className="giter-scroll min-h-0 flex-1 overflow-y-auto">
          {files.length === 0 ? (
            <div className="workspace-empty">
              <span className="workspace-empty__icon">
                <InboxIcon />
              </span>
              <p className="workspace-empty__title">{t("workspaceCleanTitle")}</p>
              <p className="workspace-empty__desc">{t("workspaceCleanHint")}</p>
            </div>
          ) : (
            <div className="workspace-file-groups">
              {conflicts.length > 0 ? (
                <FileGroup
                  title={t("workspaceConflicts")}
                  count={conflicts.length}
                  variant="conflict"
                  icon={<TriangleAlertIcon />}
                  files={conflicts}
                  selected={selected}
                  onSelect={(file) => onSelect({ path: file.path, staged: false })}
                />
              ) : null}
              <FileGroup
                title={t("workspaceStaged")}
                count={stagedCount}
                icon={<FileTextIcon />}
                files={staged}
                selected={selected}
                preferStaged
                onSelect={(file) => onSelect({ path: file.path, staged: true })}
                onQuick={(file) => onUnstage([file.path])}
                quickIcon={<MinusIcon />}
                quickLabel={t("workspaceUnstage")}
                actions={
                  staged.length > 0 ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => onUnstage(staged.map((file) => file.path))}
                    >
                      {t("workspaceUnstageAll")}
                    </Button>
                  ) : null
                }
              />
              <FileGroup
                title={t("workspaceUnstaged")}
                count={unstagedCount}
                icon={<FileTextIcon />}
                files={unstaged}
                selected={selected}
                onSelect={(file) => onSelect({ path: file.path, staged: false })}
                onQuick={(file) => onStage([file.path])}
                quickIcon={<PlusIcon />}
                quickLabel={t("workspaceStage")}
                actions={
                  unstaged.length > 0 ? (
                    <>
                      {discardable.length > 0 ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          disabled={busy}
                          title={t("workspaceDiscardAll")}
                          onClick={() =>
                            onDiscardAll(discardable.map((file) => file.path))
                          }
                        >
                          <Undo2Icon />
                          {t("workspaceDiscard")}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => onStage(unstaged.map((file) => file.path))}
                      >
                        {t("workspaceStageAll")}
                      </Button>
                    </>
                  ) : null
                }
              />
            </div>
          )}
        </div>
      </div>

      <div className="workspace-split__main">
        {selectedFile && pathParts ? (
          <div className="workspace-pane-head">
            <span className="workspace-file__status" data-kind={selectedFile.kind}>
              {statusGlyph(selectedFile)}
            </span>
            <span className="workspace-pane-head__path" title={selectedFile.path}>
              {pathParts.dir ? (
                <span className="workspace-pane-head__dir">{pathParts.dir}</span>
              ) : null}
              <span className="workspace-pane-head__name">{pathParts.name}</span>
            </span>
            {stats.add > 0 || stats.del > 0 ? (
              <span className="workspace-hunk__stat">
                <span className="workspace-hunk__stat--add">+{stats.add}</span>{" "}
                <span className="workspace-hunk__stat--del">−{stats.del}</span>
              </span>
            ) : null}
            {selectedFile.conflicted ? (
              <>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onConflict(selectedFile.path, "ours")}
                >
                  {t("workspaceOurs")}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onConflict(selectedFile.path, "theirs")}
                >
                  {t("workspaceTheirs")}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  disabled={busy}
                  onClick={() => onMarkResolved(selectedFile.path)}
                >
                  {t("workspaceMarkResolved")}
                </Button>
              </>
            ) : selected?.staged ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={busy}
                onClick={() => onUnstage([selectedFile.path])}
              >
                {t("workspaceUnstage")}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  size="xs"
                  disabled={busy}
                  onClick={() => onStage([selectedFile.path])}
                >
                  {t("workspaceStage")}
                </Button>
                {selectedFile.kind !== "untracked" ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => onDiscard([selectedFile.path])}
                  >
                    {t("workspaceDiscard")}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
        <div className="giter-scroll min-h-0 flex-1 overflow-auto">
          {selectedFile ? (
            <DiffView
              key={`${selected?.path ?? ""}:${selected?.staged ? "s" : "u"}`}
              diff={diff}
              staged={selected?.staged ?? false}
              busy={busy}
              onApply={onApplyHunk}
            />
          ) : (
            <div className="workspace-empty">
              <span className="workspace-empty__icon">
                <FileTextIcon />
              </span>
              <p className="workspace-empty__title">{t("workspaceSelectFile")}</p>
              <p className="workspace-empty__desc">{t("workspaceSelectFileHint")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FileGroup({
  title,
  count,
  icon,
  files,
  selected,
  preferStaged,
  variant,
  actions,
  onSelect,
  onQuick,
  quickIcon,
  quickLabel,
}: {
  title: string;
  count: number;
  icon: ReactNode;
  files: ChangedFile[];
  selected: Selected;
  preferStaged?: boolean;
  variant?: "conflict";
  actions?: ReactNode;
  onSelect: (file: ChangedFile) => void;
  onQuick?: (file: ChangedFile) => void;
  quickIcon?: ReactNode;
  quickLabel?: string;
}) {
  const { t } = useI18n();
  if (files.length === 0) return null;
  return (
    <section
      className={
        variant === "conflict"
          ? "workspace-file-group workspace-file-group--conflict"
          : "workspace-file-group"
      }
    >
      <h3 className="workspace-file-group__head">
        <span className="workspace-file-group__title">
          {icon}
          {title}
          <span className="workspace-count">{count}</span>
        </span>
        {actions ? (
          <span className="workspace-file-group__actions">{actions}</span>
        ) : null}
      </h3>
      <ul className="flex flex-col">
        {files.map((file) => {
          const active =
            selected?.path === file.path &&
            (preferStaged ? selected.staged : !selected.staged);
          const parts = splitPath(file.path);
          const kindLabel = t(STATUS_LABEL_KEY[file.kind] ?? "workspaceStatusModified");
          return (
            <li
              key={`${file.path}:${file.kind}`}
              className="workspace-file"
              data-active={active ? "true" : undefined}
            >
              <button
                type="button"
                className="workspace-file__main"
                title={`${file.path} — ${kindLabel}`}
                onClick={() => onSelect(file)}
              >
                <span className="workspace-file__status" data-kind={file.kind}>
                  {statusGlyph(file)}
                </span>
                <span className="workspace-file__path">
                  {parts.dir ? (
                    <span className="workspace-file__dir">{parts.dir}</span>
                  ) : null}
                  <span className="workspace-file__name">{parts.name}</span>
                </span>
              </button>
              {onQuick && quickIcon ? (
                <span className="workspace-file__quick">
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    title={quickLabel}
                    aria-label={quickLabel}
                    onClick={() => onQuick(file)}
                  >
                    {quickIcon}
                  </Button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
