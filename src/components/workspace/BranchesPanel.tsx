import { useState, type FormEvent, type ReactNode } from "react";
import {
  ArchiveIcon,
  CheckIcon,
  CloudIcon,
  EllipsisIcon,
  GitBranchIcon,
  LoaderCircleIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
  UploadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/hooks/useI18n";
import type { BranchInfo, RemoteInfo, StashEntry, TagInfo } from "@/lib/tauri";

type Props = {
  branches: BranchInfo[];
  tags: TagInfo[];
  stashes: StashEntry[];
  remotes: RemoteInfo[];
  busy: boolean;
  /** True until the first refs response lands, so an empty repo does not flash "no branches". */
  loading: boolean;
  onCheckout: (name: string) => void;
  onCreateBranch: (name: string) => void;
  onDeleteBranch: (name: string) => void;
  onMerge: (name: string) => void;
  onRebase: (name: string) => void;
  onCreateTag: (name: string) => void;
  onDeleteTag: (name: string) => void;
  onPushTags: () => void;
  onStashPush: () => void;
  onStashApply: (selector: string, pop: boolean) => void;
  onStashDrop: (selector: string) => void;
  onAddRemote: (name: string, url: string) => void;
  onPublishGithub: (name: string, privateRepo: boolean) => void;
};

export function BranchesPanel({
  branches,
  tags,
  stashes,
  remotes,
  busy,
  loading,
  onCheckout,
  onCreateBranch,
  onDeleteBranch,
  onMerge,
  onRebase,
  onCreateTag,
  onDeleteTag,
  onPushTags,
  onStashPush,
  onStashApply,
  onStashDrop,
  onAddRemote,
  onPublishGithub,
}: Props) {
  const { t } = useI18n();
  const [branchName, setBranchName] = useState("");
  const [tagName, setTagName] = useState("");
  const [remoteName, setRemoteName] = useState("origin");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [publishName, setPublishName] = useState("");
  const locals = branches.filter((branch) => !branch.remote);
  const remoteBranches = branches.filter((branch) => branch.remote);
  const loadingRow = <EmptyRow icon={<LoaderCircleIcon className="animate-spin" />} text={t("workspaceLoading")} />;

  const submitBranch = (event: FormEvent) => {
    event.preventDefault();
    const name = branchName.trim();
    if (!name) return;
    onCreateBranch(name);
    setBranchName("");
  };

  const submitTag = (event: FormEvent) => {
    event.preventDefault();
    const name = tagName.trim();
    if (!name) return;
    onCreateTag(name);
    setTagName("");
  };

  return (
    <div className="workspace-scroll">
      <div className="workspace-stack">
        <Card
          icon={<GitBranchIcon />}
          title={t("workspaceLocalBranches")}
          count={locals.length}
          head={
            <form className="flex items-center gap-1.5" onSubmit={submitBranch}>
              <Input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder={t("workspaceBranchName")}
                className="h-7 w-40 text-xs"
                disabled={busy}
              />
              <Button
                type="submit"
                size="xs"
                variant="outline"
                disabled={busy || !branchName.trim()}
              >
                <PlusIcon />
                {t("workspaceCreateBranch")}
              </Button>
            </form>
          }
        >
          {locals.length === 0 ? (
            loading ? (
              loadingRow
            ) : (
              <EmptyRow icon={<GitBranchIcon />} text={t("workspaceNoBranches")} />
            )
          ) : (
            locals.map((branch) => (
              <div
                key={branch.name}
                className="workspace-row"
                data-current={branch.current ? "true" : undefined}
              >
                <span className="flex size-3.5 shrink-0 items-center justify-center">
                  {branch.current ? (
                    <CheckIcon className="size-3.5 text-primary" />
                  ) : null}
                </span>
                <span className="workspace-row__name">
                  <span className="truncate" title={branch.name}>
                    {branch.name}
                  </span>
                </span>
                {branch.current ? (
                  <span className="workspace-chip workspace-chip--branch">
                    {t("workspaceCurrent")}
                  </span>
                ) : null}
                {branch.upstream ? (
                  <span className="workspace-chip max-w-[14rem]" title={branch.upstream}>
                    <span className="truncate">{branch.upstream}</span>
                  </span>
                ) : (
                  <span className="workspace-chip">{t("workspaceNoUpstream")}</span>
                )}
                <span className="workspace-row__actions">
                  {!branch.current ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      className="workspace-row__primary"
                      disabled={busy}
                      onClick={() => onCheckout(branch.name)}
                    >
                      {t("workspaceCheckout")}
                    </Button>
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        className="workspace-row__menu"
                        aria-label={t("workspaceActions")}
                        title={t("workspaceActions")}
                      >
                        <EllipsisIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {!branch.current ? (
                        <DropdownMenuItem onSelect={() => onCheckout(branch.name)}>
                          {t("workspaceCheckout")}
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem onSelect={() => onMerge(branch.name)}>
                        {t("workspaceMerge")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onRebase(branch.name)}>
                        {t("workspaceRebase")}
                      </DropdownMenuItem>
                      {!branch.current ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => onDeleteBranch(branch.name)}
                          >
                            <TrashIcon />
                            {t("workspaceDelete")}
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </div>
            ))
          )}
        </Card>

        {remoteBranches.length > 0 ? (
          <Card
            icon={<CloudIcon />}
            title={t("workspaceRemoteBranches")}
            count={remoteBranches.length}
          >
            {remoteBranches.map((branch) => (
              <div key={branch.name} className="workspace-row">
                <span className="size-3.5 shrink-0" />
                <span className="workspace-row__name">
                  <span className="truncate text-muted-foreground" title={branch.name}>
                    {branch.name}
                  </span>
                </span>
                <span className="workspace-row__actions">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="workspace-row__primary"
                    disabled={busy}
                    onClick={() => onCheckout(branch.name)}
                  >
                    {t("workspaceCheckout")}
                  </Button>
                </span>
              </div>
            ))}
          </Card>
        ) : null}

        <Card
          icon={<TagIcon />}
          title={t("workspaceTags")}
          count={tags.length}
          head={
            <div className="flex items-center gap-1.5">
              <form className="flex items-center gap-1.5" onSubmit={submitTag}>
                <Input
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                  placeholder={t("workspaceTagName")}
                  className="h-7 w-32 text-xs"
                  disabled={busy}
                />
                <Button
                  type="submit"
                  size="xs"
                  variant="outline"
                  disabled={busy || !tagName.trim()}
                >
                  <PlusIcon />
                  {t("workspaceCreateTag")}
                </Button>
              </form>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={busy || tags.length === 0}
                onClick={onPushTags}
              >
                <UploadIcon />
                {t("workspacePushTags")}
              </Button>
            </div>
          }
        >
          {tags.length === 0 ? (
            loading ? (
              loadingRow
            ) : (
              <EmptyRow icon={<TagIcon />} text={t("workspaceNoTags")} />
            )
          ) : (
            tags.map((tag) => (
              <div key={tag.name} className="workspace-row">
                <TagIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="workspace-row__name">
                  <span className="truncate" title={tag.name}>
                    {tag.name}
                  </span>
                </span>
                {tag.subject ? (
                  <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">
                    {tag.subject}
                  </span>
                ) : null}
                <span className="workspace-chip font-mono">{tag.hash}</span>
                <span className="workspace-row__actions">
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="workspace-row__primary"
                    aria-label={t("workspaceDelete")}
                    title={t("workspaceDelete")}
                    disabled={busy}
                    onClick={() => onDeleteTag(tag.name)}
                  >
                    <TrashIcon />
                  </Button>
                </span>
              </div>
            ))
          )}
        </Card>

        <Card
          icon={<ArchiveIcon />}
          title={t("workspaceStash")}
          count={stashes.length}
          head={
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={onStashPush}
            >
              <PlusIcon />
              {t("workspaceStashPush")}
            </Button>
          }
        >
          {stashes.length === 0 ? (
            loading ? (
              loadingRow
            ) : (
              <EmptyRow icon={<ArchiveIcon />} text={t("workspaceStashEmpty")} />
            )
          ) : (
            stashes.map((stash) => (
              <div key={stash.selector} className="workspace-row">
                <span className="min-w-0 flex-1 truncate text-xs" title={stash.subject}>
                  {stash.subject}
                </span>
                <span className="workspace-chip font-mono">{stash.selector}</span>
                <span className="workspace-row__actions">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="workspace-row__primary"
                    disabled={busy}
                    onClick={() => onStashApply(stash.selector, true)}
                  >
                    {t("workspaceStashPop")}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        className="workspace-row__menu"
                        aria-label={t("workspaceActions")}
                        title={t("workspaceActions")}
                      >
                        <EllipsisIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        onSelect={() => onStashApply(stash.selector, false)}
                      >
                        {t("workspaceStashApply")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => onStashApply(stash.selector, true)}
                      >
                        {t("workspaceStashPop")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => onStashDrop(stash.selector)}
                      >
                        <TrashIcon />
                        {t("workspaceStashDrop")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </div>
            ))
          )}
        </Card>

        <Card icon={<CloudIcon />} title={t("detailRemotes")} count={remotes.length}>
          {remotes.length === 0 ? (
            <EmptyRow icon={<CloudIcon />} text={t("detailNoRemotes")} />
          ) : (
            remotes.map((remote) => (
              <div key={remote.name} className="workspace-row">
                <CloudIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="w-20 shrink-0 truncate text-xs">{remote.name}</span>
                <span
                  className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
                  title={remote.url}
                >
                  {remote.url}
                </span>
              </div>
            ))
          )}
          <form
            className="workspace-card__foot flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!remoteName.trim() || !remoteUrl.trim()) return;
              onAddRemote(remoteName.trim(), remoteUrl.trim());
              setRemoteUrl("");
            }}
          >
            <Input
              value={remoteName}
              onChange={(e) => setRemoteName(e.target.value)}
              placeholder={t("detailRemoteName")}
              className="h-7 w-24 text-xs"
              disabled={busy}
            />
            <Input
              className="h-7 min-w-0 flex-1 font-mono text-xs"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="git@github.com:user/repo.git"
              disabled={busy}
            />
            <Button
              type="submit"
              size="xs"
              variant="outline"
              disabled={busy || !remoteName.trim() || !remoteUrl.trim()}
            >
              <PlusIcon />
              {t("add")}
            </Button>
          </form>
        </Card>

        {remotes.length === 0 ? (
          <Card icon={<UploadIcon />} title={t("detailPublishGithub")}>
            <div className="flex flex-col gap-2 p-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("detailPublishHint")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={publishName}
                  onChange={(e) => setPublishName(e.target.value)}
                  placeholder={t("detailPublishRepoName")}
                  className="h-7 w-48 text-xs"
                  disabled={busy}
                />
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={busy || !publishName.trim()}
                  onClick={() => onPublishGithub(publishName.trim(), false)}
                >
                  {t("detailPublishPublic")}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={busy || !publishName.trim()}
                  onClick={() => onPublishGithub(publishName.trim(), true)}
                >
                  {t("detailPublishPrivate")}
                </Button>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  count,
  head,
  children,
}: {
  icon: ReactNode;
  title: string;
  count?: number;
  head?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="workspace-card">
      <div className="workspace-card__head">
        <span className="workspace-card__title">
          {icon}
          {title}
          {count != null ? <span className="workspace-count">{count}</span> : null}
        </span>
        {head ? <div className="ml-auto flex items-center gap-1.5">{head}</div> : null}
      </div>
      <div className="workspace-card__body">{children}</div>
    </section>
  );
}

function EmptyRow({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="workspace-empty workspace-empty--compact">
      <span className="workspace-empty__icon">{icon}</span>
      <p className="workspace-empty__desc">{text}</p>
    </div>
  );
}
