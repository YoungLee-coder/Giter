import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/hooks/useI18n";
import { queryKeys } from "@/lib/query/keys";
import { api, type RepoStatus } from "@/lib/tauri";

type Mode = "clone" | "init" | null;

type Props = {
  mode: Mode;
  onOpenChange: (open: boolean) => void;
  onAdded: (repo: RepoStatus) => void;
};

function folderNameFromUrl(url: string): string {
  const trimmed = url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
  const parts = trimmed.split(/[/:]/);
  return parts[parts.length - 1] || "repo";
}

export function CloneInitDialog({ mode, onOpenChange, onAdded }: Props) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [dest, setDest] = useState("");
  const [working, setWorking] = useState(false);

  const reset = () => {
    setUrl("");
    setDest("");
    setWorking(false);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const pickFolder = async () => {
    const path = await open({ directory: true, multiple: false });
    if (!path || Array.isArray(path)) return;
    if (mode === "clone") {
      const name = folderNameFromUrl(url);
      setDest(url.trim() ? `${path}/${name}` : path);
    } else {
      setDest(path);
    }
  };

  const submit = async () => {
    if (working) return;
    setWorking(true);
    try {
      const repo =
        mode === "clone"
          ? await api.cloneRepo(url.trim(), dest.trim())
          : await api.initRepo(dest.trim());
      queryClient.setQueryData<RepoStatus[]>(queryKeys.repos, (prev) => {
        const list = prev ?? [];
        if (list.some((r) => r.path === repo.path)) {
          return list.map((r) => (r.path === repo.path ? repo : r));
        }
        return [...list, repo];
      });
      onAdded(repo);
      toast.success(mode === "clone" ? t("clone") : t("initRepo"));
      close();
    } catch (e) {
      toast.error(String(e));
      setWorking(false);
    }
  };

  return (
    <Dialog
      open={mode != null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "clone" ? t("cloneTitle") : t("initTitle")}</DialogTitle>
          <DialogDescription>
            {mode === "init" ? t("initHint") : t("cloneUrl")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {mode === "clone" ? (
            <Field>
              <FieldLabel>{t("cloneUrl")}</FieldLabel>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="git@github.com:user/repo.git"
                autoComplete="off"
                spellCheck={false}
                disabled={working}
                autoFocus
              />
            </Field>
          ) : null}
          <Field>
            <FieldLabel>{t("cloneDest")}</FieldLabel>
            <div className="flex gap-2">
              <Input
                className="font-mono"
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                disabled={working}
                autoFocus={mode === "init"}
              />
              <Button type="button" variant="outline" onClick={() => void pickFolder()}>
                {t("cloneChooseFolder")}
              </Button>
            </div>
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={working}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={working || !dest.trim() || (mode === "clone" && !url.trim())}
            onClick={() => void submit()}
          >
            {working ? (
              <>
                <Spinner />
                {mode === "clone" ? t("cloneWorking") : t("initWorking")}
              </>
            ) : mode === "clone" ? (
              t("clone")
            ) : (
              t("initRepo")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
