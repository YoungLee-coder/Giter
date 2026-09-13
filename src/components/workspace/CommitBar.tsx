import { GitCommitHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/hooks/useI18n";
import { isMac } from "@/lib/platform";

type Props = {
  stagedCount: number;
  message: string;
  amend: boolean;
  canAmend: boolean;
  busy: boolean;
  onMessageChange: (value: string) => void;
  onAmendChange: (value: boolean) => void;
  onSubmit: () => void;
};

/**
 * Commit composer for the repo detail page: staged summary, message field and
 * a ⌘/Ctrl+Enter shortcut so the keyboard never has to leave the textarea.
 */
export function CommitBar({
  stagedCount,
  message,
  amend,
  canAmend,
  busy,
  onMessageChange,
  onAmendChange,
  onSubmit,
}: Props) {
  const { t } = useI18n();
  const modKey = isMac() ? "⌘" : "Ctrl";
  const canSubmit = !busy && (amend || message.trim().length > 0);

  return (
    <form
      className="workspace-commit"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <div className="workspace-commit__head">
        <span className="workspace-commit__title">
          <GitCommitHorizontalIcon />
          {t("workspaceStagedSummary", { staged: stagedCount })}
        </span>
        {canAmend ? (
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={amend}
              disabled={busy}
              onCheckedChange={(value) => onAmendChange(value === true)}
            />
            {t("workspaceAmend")}
          </label>
        ) : null}
      </div>
      <textarea
        className="workspace-commit__field"
        value={message}
        rows={2}
        placeholder={t("workspaceMessage")}
        disabled={busy}
        onChange={(event) => onMessageChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canSubmit) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="workspace-commit__foot">
        <span className="workspace-commit__hint">
          <kbd className="workspace-kbd">{modKey}</kbd>
          <kbd className="workspace-kbd">↵</kbd>
          {t("workspaceCommitHint")}
        </span>
        <Button type="submit" size="sm" className="ml-auto" disabled={!canSubmit}>
          {t("workspaceCommit")}
        </Button>
      </div>
    </form>
  );
}
