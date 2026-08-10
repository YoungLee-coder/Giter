import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useI18n } from "../i18n";
import {
  api,
  type GithubPublishInfo,
  type RepoDetail,
  type RepoStatus,
} from "../lib/tauri";

type Props = {
  repo: RepoStatus | null;
  onClose: () => void;
};

type RemoteMode = "idle" | "publish" | "addUrl";

export function RepoDetailModal({ repo, onClose }: Props) {
  const { t, locale } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<RepoDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteMode, setRemoteMode] = useState<RemoteMode>("idle");
  const [publishName, setPublishName] = useState("");
  const [publishInfo, setPublishInfo] = useState<GithubPublishInfo | null>(null);
  const [publishInfoLoading, setPublishInfoLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [remoteName, setRemoteName] = useState("origin");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [savingRemote, setSavingRemote] = useState(false);
  const publishNameId = useId();
  const remoteNameId = useId();
  const remoteUrlId = useId();

  const resetRemoteForm = () => {
    setRemoteMode("idle");
    setPublishName(repo?.name ?? "");
    setPublishInfo(null);
    setPublishInfoLoading(false);
    setPublishing(false);
    setRemoteName("origin");
    setRemoteUrl("");
    setSavingRemote(false);
  };

  useEffect(() => {
    if (!repo) {
      setDetail(null);
      setError(null);
      setLoading(false);
      setRemoteMode("idle");
      setPublishName("");
      setPublishInfo(null);
      setPublishInfoLoading(false);
      setPublishing(false);
      setRemoteName("origin");
      setRemoteUrl("");
      setSavingRemote(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setRemoteMode("idle");
    setPublishName(repo.name);
    setPublishInfo(null);
    setPublishInfoLoading(false);
    setPublishing(false);
    setRemoteName("origin");
    setRemoteUrl("");
    setSavingRemote(false);

    void api
      .repoDetail(repo.path)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [repo]);

  useEffect(() => {
    if (!repo) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (remoteMode !== "idle") {
        setRemoteMode("idle");
        setPublishName(repo.name);
        setPublishInfo(null);
        setPublishing(false);
        setRemoteName("origin");
        setRemoteUrl("");
        setSavingRemote(false);
        return;
      }
      onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    focusable?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [repo, onClose, remoteMode]);

  useEffect(() => {
    if (remoteMode !== "publish" || !repo) return;

    let cancelled = false;
    setPublishInfoLoading(true);
    void api
      .githubPublishInfo()
      .then((info) => {
        if (!cancelled) setPublishInfo(info);
      })
      .catch((e) => {
        if (!cancelled) {
          setPublishInfo({ available: false, login: null });
          setError(String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setPublishInfoLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [remoteMode, repo]);

  useEffect(() => {
    if (remoteMode === "publish") {
      const input = dialogRef.current?.querySelector<HTMLInputElement>(
        `#${CSS.escape(publishNameId)}`,
      );
      input?.focus();
      input?.select();
      return;
    }
    if (remoteMode === "addUrl") {
      const input = dialogRef.current?.querySelector<HTMLInputElement>(
        `#${CSS.escape(remoteUrlId)}`,
      );
      input?.focus();
      input?.select();
    }
  }, [remoteMode, publishNameId, remoteUrlId]);

  if (!repo) return null;

  const status = detail?.status ?? repo;
  const dateFmt = new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
  };

  const onReveal = async () => {
    try {
      await revealItemInDir(repo.path);
    } catch (e) {
      setError(String(e));
    }
  };

  const onPublish = async (privateRepo: boolean) => {
    const name = publishName.trim();
    if (!name || publishing) return;

    setPublishing(true);
    setError(null);
    try {
      const result = await api.publishToGithub(repo.path, name, privateRepo);
      setDetail(result);
      resetRemoteForm();
    } catch (e) {
      setError(String(e));
    } finally {
      setPublishing(false);
    }
  };

  const onAddRemote = async (event: FormEvent) => {
    event.preventDefault();
    const name = remoteName.trim();
    const url = remoteUrl.trim();
    if (!name || !url || savingRemote) return;

    setSavingRemote(true);
    setError(null);
    try {
      const result = await api.addRemote(repo.path, name, url);
      setDetail(result);
      resetRemoteForm();
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingRemote(false);
    }
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
        <ul className="detail-list">
          {detail?.remotes.map((remote) => (
            <li key={remote.name} className="detail-list__item">
              <span className="detail-list__label">{remote.name}</span>
              <span className="detail-list__value mono" title={remote.url}>
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
        <div className="detail-publish">
          <p className="detail-empty">{t("detailPublishHint")}</p>

          {publishInfoLoading && (
            <p className="detail-empty">{t("detailLoading")}</p>
          )}

          {!publishInfoLoading && publishInfo && !publishInfo.available && (
            <p className="detail-empty">{t("detailPublishGhMissing")}</p>
          )}

          {!publishInfoLoading &&
            publishInfo?.available &&
            !publishInfo.login && (
              <p className="detail-empty">{t("detailPublishGhAuth")}</p>
            )}

          {!publishInfoLoading && publishInfo?.available && publishInfo.login && (
            <>
              <label className="detail-remote-form__field" htmlFor={publishNameId}>
                <span>{t("detailPublishRepoName")}</span>
                <input
                  id={publishNameId}
                  className="detail-remote-form__input"
                  value={publishName}
                  onChange={(e) => setPublishName(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={publishing}
                  required
                />
              </label>

              <div className="detail-publish__choices" role="group">
                <button
                  type="button"
                  className="detail-publish__choice"
                  disabled={!canPublish}
                  onClick={() => void onPublish(false)}
                >
                  <span className="detail-publish__choice-title mono">
                    {publishPreview()}
                  </span>
                  <span className="detail-publish__choice-meta">
                    {t("detailPublishPublic")}
                  </span>
                </button>
                <button
                  type="button"
                  className="detail-publish__choice"
                  disabled={!canPublish}
                  onClick={() => void onPublish(true)}
                >
                  <span className="detail-publish__choice-title mono">
                    {publishPreview()}
                  </span>
                  <span className="detail-publish__choice-meta">
                    {t("detailPublishPrivate")}
                  </span>
                </button>
              </div>

              {publishing && (
                <p className="detail-empty">{t("detailPublishWorking")}</p>
              )}
            </>
          )}

          <div className="detail-remote-form__actions">
            <button
              type="button"
              className="ghost"
              onClick={resetRemoteForm}
              disabled={publishing}
            >
              {t("detailRemoteCancel")}
            </button>
            <button
              type="button"
              className="ghost detail-empty__action"
              onClick={() => {
                setError(null);
                setRemoteMode("addUrl");
              }}
              disabled={publishing}
            >
              {t("detailAddRemoteUrl")}
            </button>
          </div>
        </div>
      );
    }

    if (remoteMode === "addUrl") {
      return (
        <form className="detail-remote-form" onSubmit={onAddRemote}>
          <div className="detail-remote-form__fields">
            <label className="detail-remote-form__field" htmlFor={remoteNameId}>
              <span>{t("detailRemoteName")}</span>
              <input
                id={remoteNameId}
                className="detail-remote-form__input"
                value={remoteName}
                onChange={(e) => setRemoteName(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={savingRemote}
                required
              />
            </label>
            <label
              className="detail-remote-form__field detail-remote-form__field--grow"
              htmlFor={remoteUrlId}
            >
              <span>{t("detailRemoteUrl")}</span>
              <input
                id={remoteUrlId}
                className="detail-remote-form__input mono"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="git@github.com:user/repo.git"
                autoComplete="off"
                spellCheck={false}
                disabled={savingRemote}
                required
              />
            </label>
          </div>
          <div className="detail-remote-form__actions">
            <button
              type="button"
              className="ghost"
              onClick={resetRemoteForm}
              disabled={savingRemote}
            >
              {t("detailRemoteCancel")}
            </button>
            <button
              type="button"
              className="ghost detail-empty__action"
              onClick={() => {
                setError(null);
                setRemoteMode("publish");
              }}
              disabled={savingRemote}
            >
              {t("detailPublishGithub")}
            </button>
            <button
              type="submit"
              className="primary"
              disabled={
                savingRemote || !remoteName.trim() || !remoteUrl.trim()
              }
            >
              {t("add")}
            </button>
          </div>
        </form>
      );
    }

    return (
      <div className="detail-empty-row">
        <p className="detail-empty">{t("detailNoRemotes")}</p>
        <button
          type="button"
          className="ghost detail-empty__action"
          onClick={() => {
            setError(null);
            setPublishName(status.name);
            setRemoteMode("publish");
          }}
        >
          {t("detailPublishGithub")}
        </button>
      </div>
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="modal modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="repo-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <div className="modal__heading">
            <h2 id="repo-detail-title" className="modal__title">
              {status.name}
            </h2>
            <p className="modal__subtitle mono" title={status.path}>
              {status.path}
            </p>
          </div>
          <div className="modal__header-actions">
            <button type="button" className="ghost" onClick={onReveal}>
              {t("detailReveal")}
            </button>
            <button
              type="button"
              className="icon-btn ghost"
              aria-label={t("settingsClose")}
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="modal__body modal__body--scroll">
          {loading && <p className="detail-loading">{t("detailLoading")}</p>}
          {error && <div className="banner err detail-banner">{error}</div>}

          {!loading && (
            <>
              <section className="detail-section">
                <h3 className="detail-section__title">{t("detailOverview")}</h3>
                <dl className="detail-grid">
                  <div className="detail-field">
                    <dt>{t("colBranch")}</dt>
                    <dd className="mono">{status.branch ?? "—"}</dd>
                  </div>
                  <div className="detail-field">
                    <dt>{t("detailUpstream")}</dt>
                    <dd className="mono">{status.upstream ?? t("noUpstream")}</dd>
                  </div>
                  <div className="detail-field">
                    <dt>{t("colSync")}</dt>
                    <dd>
                      {!status.upstream
                        ? t("noUpstream")
                        : status.ahead === 0 && status.behind === 0
                          ? t("synced")
                          : `↑${status.ahead} ↓${status.behind}`}
                    </dd>
                  </div>
                  <div className="detail-field">
                    <dt>{t("colStatus")}</dt>
                    <dd>
                      {status.lastError
                        ? t("error")
                        : status.dirty
                          ? t("dirty")
                          : t("clean")}
                    </dd>
                  </div>
                </dl>
                {status.lastError && (
                  <p className="detail-error mono">{status.lastError}</p>
                )}
              </section>

              <section className="detail-section">
                <h3 className="detail-section__title">{t("detailRemotes")}</h3>
                {renderRemoteSection()}
              </section>

              <section className="detail-section">
                <h3 className="detail-section__title">{t("detailChanges")}</h3>
                {(detail?.changedFiles.length ?? 0) === 0 ? (
                  <p className="detail-empty">{t("detailNoChanges")}</p>
                ) : (
                  <ul className="detail-list detail-list--files">
                    {detail?.changedFiles.map((file) => (
                      <li key={file} className="detail-list__item mono">
                        {file}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="detail-section">
                <h3 className="detail-section__title">{t("detailCommits")}</h3>
                {(detail?.commits.length ?? 0) === 0 ? (
                  <p className="detail-empty">{t("detailNoCommits")}</p>
                ) : (
                  <ul className="detail-commits">
                    {detail?.commits.map((commit) => (
                      <li key={commit.hash} className="detail-commit">
                        <div className="detail-commit__top">
                          <span className="detail-commit__hash mono">
                            {commit.shortHash}
                          </span>
                          <span className="detail-commit__meta">
                            {commit.author} · {formatDate(commit.date)}
                          </span>
                        </div>
                        <p className="detail-commit__subject">{commit.subject}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M2.1 2.1a.75.75 0 0 1 1.06 0L6 4.94l2.84-2.84a.75.75 0 1 1 1.06 1.06L7.06 6l2.84 2.84a.75.75 0 1 1-1.06 1.06L6 7.06 3.16 9.9a.75.75 0 0 1-1.06-1.06L4.94 6 2.1 3.16a.75.75 0 0 1 0-1.06Z"
        fill="currentColor"
      />
    </svg>
  );
}
