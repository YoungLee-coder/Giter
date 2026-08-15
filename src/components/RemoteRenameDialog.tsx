import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRightIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/hooks/useI18n";
import { queryKeys } from "@/lib/query";
import { api, type RemoteRename, type RepoStatus } from "@/lib/tauri";

/**
 * Renames are detected while fetching; nothing is rewritten until the user
 * confirms here. Closing the dialog dismisses them for this session — the next
 * fetch detects them again.
 */
export function RemoteRenameDialog({
  renames,
  onDone,
}: {
  renames: RemoteRename[];
  onDone: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [working, setWorking] = useState(false);
  const [items, setItems] = useState<RemoteRename[]>(renames);

  // Keep the last list while the Dialog exit animation plays.
  useEffect(() => {
    if (renames.length > 0) setItems(renames);
  }, [renames]);

  const applyAll = async () => {
    if (working) return;
    setWorking(true);
    const updated: RepoStatus[] = [];
    let failure: string | null = null;

    for (const item of items) {
      try {
        updated.push(await api.applyRemoteRename(item.path, item.remote, item.newUrl));
      } catch (e) {
        if (failure === null) failure = String(e);
      }
    }

    if (updated.length > 0) {
      const byPath = new Map(updated.map((r) => [r.path, r]));
      queryClient.setQueryData<RepoStatus[]>(queryKeys.repos, (prev) =>
        (prev ?? []).map((r) => byPath.get(r.path) ?? r),
      );
      for (const repo of updated) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.repoDetail(repo.path) });
      }
      toast.success(t("remoteRenameApplied"));
    }
    if (failure) toast.error(t("remoteRenameFailed", { error: failure }));

    setWorking(false);
    onDone();
  };

  const dismissAll = () => {
    if (working) return;
    for (const item of items) {
      void api.dismissRemoteRename(item.path, item.remote).catch(() => {
        /* dismissal is best-effort; the next fetch detects it again */
      });
    }
    onDone();
  };

  return (
    <Dialog
      open={renames.length > 0}
      onOpenChange={(next) => {
        if (!next) dismissAll();
      }}
    >
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("remoteRenameTitle")}</DialogTitle>
          <DialogDescription>{t("remoteRenameDescription")}</DialogDescription>
        </DialogHeader>

        <ul className="soft-panel flex min-w-0 flex-col divide-y divide-border/80">
          {items.map((item) => (
            <li
              key={`${item.path}::${item.remote}`}
              className="flex min-w-0 flex-col gap-1 px-3 py-2.5"
            >
              <span className="text-xs text-muted-foreground">
                {item.repoName} · {item.remote}
              </span>
              <span
                className="min-w-0 truncate font-mono text-xs text-muted-foreground line-through"
                title={item.oldUrl}
              >
                {item.oldUrl}
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <ArrowRightIcon
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate font-mono text-sm" title={item.newUrl}>
                  {item.newUrl}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={working} onClick={dismissAll}>
            {t("remoteRenameLater")}
          </Button>
          <Button type="button" disabled={working} onClick={() => void applyAll()}>
            {working && <Spinner />}
            {working ? t("remoteRenameWorking") : t("remoteRenameApply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
