import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { CommitGraph } from "@/components/repo/CommitGraph";
import { useI18n } from "@/hooks/useI18n";
import { queryKeys } from "@/lib/query/keys";
import {
  api,
  type GithubPublishInfo,
  type RepoDetail,
  type RepoStatus,
} from "@/lib/tauri";

type RemoteMode = "idle" | "publish" | "addUrl";

type Props = {
  repo: RepoStatus | null;
  onClose: () => void;
};

const initialRemote = {
  remoteMode: "idle" as RemoteMode,
  publishName: "",
  publishInfo: null as GithubPublishInfo | null,
  publishInfoLoading: false,
  publishing: false,
  remoteName: "origin",
  remoteUrl: "",
  savingRemote: false,
};

export function RepoDetailModal({ repo, onClose }: Props) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [detail, setDetail] = useState<RepoDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteMode, setRemoteMode] = useState<RemoteMode>(initialRemote.remoteMode);
  const [publishName, setPublishName] = useState(initialRemote.publishName);
  const [publishInfo, setPublishInfo] = useState<GithubPublishInfo | null>(
    initialRemote.publishInfo,
  );
  const [publishInfoLoading, setPublishInfoLoading] = useState(
    initialRemote.publishInfoLoading,
  );
  const [publishing, setPublishing] = useState(initialRemote.publishing);
  const [remoteName, setRemoteName] = useState(initialRemote.remoteName);
  const [remoteUrl, setRemoteUrl] = useState(initialRemote.remoteUrl);
  const [savingRemote, setSavingRemote] = useState(initialRemote.savingRemote);
  const detailLoadSeq = useRef(0);
  const publishInfoSeq = useRef(0);
  const publishNameRef = useRef(publishName);
  const publishingRef = useRef(publishing);
  const remoteNameRef = useRef(remoteName);
  const remoteUrlRef = useRef(remoteUrl);
  const savingRemoteRef = useRef(savingRemote);
  publishNameRef.current = publishName;
  publishingRef.current = publishing;
  remoteNameRef.current = remoteName;
  remoteUrlRef.current = remoteUrl;
  savingRemoteRef.current = savingRemote;
  const publishNameId = useId();
  const remoteNameId = useId();
  const remoteUrlId = useId();

  const syncRepoStatus = (status: RepoStatus) => {
    queryClient.setQueryData<RepoStatus[]>(queryKeys.repos, (prev) =>
      prev?.map((r) => (r.path === status.path ? status : r)),
    );
  };

  const applyInitialRemote = (repoName = "") => {
    setRemoteMode(initialRemote.remoteMode);
    setPublishName(repoName);
    setPublishInfo(initialRemote.publishInfo);
    setPublishInfoLoading(initialRemote.publishInfoLoading);
    setPublishing(initialRemote.publishing);
    setRemoteName(initialRemote.remoteName);
    setRemoteUrl(initialRemote.remoteUrl);
    setSavingRemote(initialRemote.savingRemote);
  };

  const resetRemoteForm = (repoName?: string) => {
    applyInitialRemote(repoName ?? "");
  };

  const openRepo = async (next: RepoStatus) => {
    const seq = ++detailLoadSeq.current;
    setLoading(true);
    setError(null);
    setDetail(null);
    applyInitialRemote(next.name);
    try {
      const result = await api.repoDetail(next.path);
      if (seq !== detailLoadSeq.current) return;
      // Hydrate detail without delaying first paint.
      if (seq !== detailLoadSeq.current) return;
      setDetail(result);
      setLoading(false);
    } catch (e) {
      if (seq !== detailLoadSeq.current) return;
      setError(String(e));
      setLoading(false);
    }
  };

  const loadPublishInfo = async () => {
    const seq = ++publishInfoSeq.current;
    setPublishInfoLoading(true);
    try {
      const info = await api.githubPublishInfo();
      if (seq !== publishInfoSeq.current) return;
      setPublishInfo(info);
    } catch (e) {
      if (seq !== publishInfoSeq.current) return;
      setPublishInfo({ available: false, login: null, gitProtocol: null });
      setError(String(e));
    } finally {
      if (seq === publishInfoSeq.current) setPublishInfoLoading(false);
    }
  };

  const reveal = async (path: string) => {
    try {
      await revealItemInDir(path);
    } catch (e) {
      setError(String(e));
    }
  };

  const publish = async (path: string, privateRepo: boolean) => {
    const name = publishNameRef.current.trim();
    if (!name || publishingRef.current) return;

    setPublishing(true);
    setError(null);
    try {
      const result = await api.publishToGithub(path, name, privateRepo);
      setDetail(result);
      syncRepoStatus(result.status);
      resetRemoteForm();
    } catch (e) {
      setError(String(e));
    } finally {
      setPublishing(false);
    }
  };

  const addRemote = async (path: string) => {
    const name = remoteNameRef.current.trim();
    const url = remoteUrlRef.current.trim();
    if (!name || !url || savingRemoteRef.current) return;

    setSavingRemote(true);
    setError(null);
    try {
      const result = await api.addRemote(path, name, url);
      setDetail(result);
      syncRepoStatus(result.status);
      resetRemoteForm();
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingRemote(false);
    }
  };

  useEffect(() => {
    if (!repo) {
      // Cancel in-flight loads; keep displayRepo content for exit animation.
      detailLoadSeq.current += 1;
      publishInfoSeq.current += 1;
      return;
    }
    void openRepo(repo);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open when repo identity changes
  }, [repo]);

  useEffect(() => {
    if (remoteMode !== "publish" || !repo) return;
    void loadPublishInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when entering publish mode
  }, [remoteMode, repo]);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en", {
        month: "short",
        day: "numeric",
      }),
    [locale],
  );

  // Keep last repo while Dialog exit animation plays (cc-switch / Radix pattern).
  const [displayRepo, setDisplayRepo] = useState<RepoStatus | null>(repo);
  useEffect(() => {
    if (repo) setDisplayRepo(repo);
  }, [repo]);

  if (!displayRepo) return null;

  const status = detail?.status ?? displayRepo;
  const activeRepo = displayRepo;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
  };

  const onAddRemote = async (event: FormEvent) => {
    event.preventDefault();
    await addRemote(activeRepo.path);
  };

  const publishPreview = () => {
    const name = publishName.trim() || status.name;
    if (publishInfo?.login && !name.includes("/")) {
      return `${publishInfo.login}/${name}`;
    }
    return name;
  };

  const renderRemoteSection = () => {
    if ((detail?.remotes.length ?? 0) > 0) {
      return (
        <ul className="soft-panel flex min-w-0 flex-col divide-y divide-border/80">
          {detail?.remotes.map((remote) => (
            <li key={remote.name} className="flex min-w-0 flex-col gap-1 px-3 py-2.5">
              <span className="text-xs text-muted-foreground">{remote.name}</span>
              <span className="min-w-0 truncate font-mono text-sm" title={remote.url}>
                {remote.url}
              </span>
            </li>
          ))}
        </ul>
      );
    }

    if (remoteMode === "publish") {
      const canPublish =
        !!publishInfo?.available &&
        !!publishInfo.login &&
        !!publishName.trim() &&
        !publishing &&
        !publishInfoLoading;

      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t("detailPublishHint")}</p>

          {publishInfoLoading && (
            <p className="text-sm text-muted-foreground">{t("detailLoading")}</p>
          )}

          {!publishInfoLoading && publishInfo && !publishInfo.available && (
            <p className="text-sm text-muted-foreground">{t("detailPublishGhMissing")}</p>
          )}

          {!publishInfoLoading && publishInfo?.available && !publishInfo.login && (
            <p className="text-sm text-muted-foreground">{t("detailPublishGhAuth")}</p>
          )}

          {!publishInfoLoading && publishInfo?.available && publishInfo.login && (
            <>
              <Field>
                <FieldLabel htmlFor={publishNameId}>
                  {t("detailPublishRepoName")}
                </FieldLabel>
                <Input
                  id={publishNameId}
                  value={publishName}
                  onChange={(e) => setPublishName(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={publishing}
                  required
                  autoFocus
                />
              </Field>

              <div className="grid gap-2 sm:grid-cols-2" role="group">
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto flex-col items-start gap-1 px-3 py-3"
                  disabled={!canPublish}
                  onClick={() => void publish(activeRepo.path, false)}
                >
                  <span className="font-mono text-sm">{publishPreview()}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("detailPublishPublic")}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto flex-col items-start gap-1 px-3 py-3"
                  disabled={!canPublish}
                  onClick={() => void publish(activeRepo.path, true)}
                >
                  <span className="font-mono text-sm">{publishPreview()}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("detailPublishPrivate")}
                  </span>
                </Button>
              </div>

              {publishing && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner />
                  {t("detailPublishWorking")}
                </p>
              )}
            </>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => resetRemoteForm(activeRepo.name)}
              disabled={publishing}
            >
              {t("detailRemoteCancel")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                setRemoteMode("addUrl");
              }}
              disabled={publishing}
            >
              {t("detailAddRemoteUrl")}
            </Button>
          </div>
        </div>
      );
    }

    if (remoteMode === "addUrl") {
      return (
        <form className="flex flex-col gap-3" onSubmit={(e) => void onAddRemote(e)}>
          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel htmlFor={remoteNameId}>{t("detailRemoteName")}</FieldLabel>
              <Input
                id={remoteNameId}
                value={remoteName}
                onChange={(e) => setRemoteName(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={savingRemote}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={remoteUrlId}>{t("detailRemoteUrl")}</FieldLabel>
              <Input
                id={remoteUrlId}
                className="font-mono"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="git@github.com:user/repo.git"
                autoComplete="off"
                spellCheck={false}
                disabled={savingRemote}
                required
                autoFocus
              />
            </Field>
          </FieldGroup>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => resetRemoteForm(activeRepo.name)}
              disabled={savingRemote}
            >
              {t("detailRemoteCancel")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                setRemoteMode("publish");
              }}
              disabled={savingRemote}
            >
              {t("detailPublishGithub")}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={savingRemote || !remoteName.trim() || !remoteUrl.trim()}
            >
              {t("add")}
            </Button>
          </div>
        </form>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">{t("detailNoRemotes")}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null);
            setPublishName(status.name);
            setRemoteMode("publish");
          }}
        >
          {t("detailPublishGithub")}
        </Button>
      </div>
    );
  };

  return (
    <Dialog
      open={!!repo}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton
        onEscapeKeyDown={(event) => {
          if (remoteMode !== "idle") {
            event.preventDefault();
            resetRemoteForm(activeRepo.name);
          }
        }}
      >
        <DialogHeader className="shrink-0 gap-3 border-b border-border/80 bg-muted/25 p-4 pr-12">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate">{status.name}</DialogTitle>
              <DialogDescription
                className="mt-1 truncate font-mono text-xs"
                title={status.path}
              >
                {status.path}
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void reveal(activeRepo.path)}
            >
              {t("detailReveal")}
            </Button>
          </div>
        </DialogHeader>

        <div className="giter-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col gap-6 p-4">
            {loading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                {t("detailLoading")}
              </p>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!loading && (
              <>
                <section className="flex flex-col gap-3">
                  <h3 className="text-sm font-medium">{t("detailOverview")}</h3>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <DetailField label={t("colBranch")}>
                      <span className="font-mono">{status.branch ?? "—"}</span>
                    </DetailField>
                    <DetailField label={t("detailUpstream")}>
                      <span className="min-w-0 break-all font-mono">
                        {status.upstream ?? t("noUpstream")}
                      </span>
                    </DetailField>
                    <DetailField label={t("colSync")}>
                      {!status.upstream
                        ? t("noUpstream")
                        : status.ahead === 0 && status.behind === 0
                          ? t("synced")
                          : `↑${status.ahead} ↓${status.behind}`}
                    </DetailField>
                    <DetailField label={t("colStatus")}>
                      {status.lastError
                        ? t("error")
                        : status.dirty
                          ? t("dirty")
                          : t("clean")}
                    </DetailField>
                  </dl>
                  {status.lastError && (
                    <p className="soft-panel soft-panel--flat border-destructive/30 bg-destructive/10 px-3 py-2 font-mono text-xs break-all text-destructive">
                      {status.lastError}
                    </p>
                  )}
                </section>

                <section className="flex min-w-0 flex-col gap-3">
                  <h3 className="text-sm font-medium">{t("detailRemotes")}</h3>
                  {renderRemoteSection()}
                </section>

                <section className="flex min-w-0 flex-col gap-3">
                  <h3 className="text-sm font-medium">{t("detailChanges")}</h3>
                  {(detail?.changedFiles.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("detailNoChanges")}
                    </p>
                  ) : (
                    <ul className="soft-panel flex min-w-0 flex-col divide-y divide-border/80">
                      {detail?.changedFiles.map((file) => (
                        <li
                          key={file}
                          className="min-w-0 break-all px-3 py-2 font-mono text-sm"
                        >
                          {file}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="flex min-w-0 flex-col gap-3">
                  <h3 className="text-sm font-medium">{t("detailCommits")}</h3>
                  {(detail?.commits.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("detailNoCommits")}
                    </p>
                  ) : (
                    <CommitGraph
                      commits={detail?.commits ?? []}
                      formatDate={formatDate}
                    />
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="soft-panel flex min-w-0 flex-col gap-1 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}
