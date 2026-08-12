import { invoke } from "@tauri-apps/api/core";

export type RepoStatus = {
  path: string;
  name: string;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  dirty: boolean;
  lastError: string | null;
  /** Detected remote host provider, or null when no remote is configured. */
  remoteProvider: RemoteProvider | string | null;
};

export type RemoteProvider =
  "github" | "gitlab" | "bitbucket" | "gitea" | "codeberg" | "azure" | "other";

export type RemovedRepo = {
  path: string;
  name: string;
};

export type RefreshResult = {
  repos: RepoStatus[];
  removed: RemovedRepo[];
};

export type BatchProgress = {
  path: string;
  stage: string;
  message: string | null;
};

export type RemoteInfo = {
  name: string;
  url: string;
};

export type CommitInfo = {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
};

export type RepoDetail = {
  status: RepoStatus;
  remotes: RemoteInfo[];
  commits: CommitInfo[];
  changedFiles: string[];
};

export type ThemePreference = "system" | "light" | "dark";

export type AppSettings = {
  scanDepth: number;
  concurrency: number;
  theme: ThemePreference;
};

export type AppInfo = {
  name: string;
  version: string;
  gitAvailable: boolean;
};

export type GitInfo = {
  available: boolean;
  version: string | null;
  path: string | null;
  execPath: string | null;
  userName: string | null;
  userEmail: string | null;
};

export type GithubProtocol = "https" | "ssh";

export type GithubPublishInfo = {
  available: boolean;
  login: string | null;
  gitProtocol: GithubProtocol | string | null;
};

export type GitIdentitySync = {
  userName: string | null;
  userEmail: string | null;
  nameUpdated: boolean;
  emailUpdated: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  scanDepth: 3,
  concurrency: 4,
  theme: "system",
};

export const api = {
  checkGit: () => invoke<boolean>("check_git"),
  listRepos: () => invoke<RepoStatus[]>("list_repos"),
  addRepo: (path: string) => invoke<RepoStatus>("add_repo", { path }),
  removeRepo: (path: string) => invoke<void>("remove_repo", { path }),
  removeRepos: (paths: string[]) => invoke<void>("remove_repos", { paths }),
  reorderRepos: (paths: string[]) => invoke<void>("reorder_repos", { paths }),
  refreshStatus: (paths?: string[]) =>
    invoke<RefreshResult>("refresh_status", { paths: paths ?? null }),
  scanFolder: (path: string, maxDepth?: number) =>
    invoke<RepoStatus[]>("scan_folder", {
      path,
      maxDepth: maxDepth ?? null,
    }),
  batchFetch: (paths: string[]) => invoke<RepoStatus[]>("batch_fetch", { paths }),
  batchUpdate: (paths: string[]) => invoke<RepoStatus[]>("batch_update", { paths }),
  repoDetail: (path: string) => invoke<RepoDetail>("repo_detail", { path }),
  addRemote: (path: string, name: string, url: string) =>
    invoke<RepoDetail>("add_remote", { path, name, url }),
  githubPublishInfo: () => invoke<GithubPublishInfo>("github_publish_info"),
  startGithubLogin: (protocol: GithubProtocol = "https") =>
    invoke<void>("start_github_login", { protocol }),
  syncGitIdentityFromGithub: (overwrite = false) =>
    invoke<GitIdentitySync>("sync_git_identity_from_github", { overwrite }),
  publishToGithub: (path: string, name: string, privateRepo: boolean) =>
    invoke<RepoDetail>("publish_to_github", {
      path,
      name,
      private: privateRepo,
    }),
  setSettingsMenuLabel: (label: string) =>
    invoke<void>("set_settings_menu_label", { label }),
  getSettings: () => invoke<AppSettings>("get_settings"),
  updateSettings: (settings: AppSettings) =>
    invoke<AppSettings>("update_settings", { settings }),
  getAppInfo: () => invoke<AppInfo>("get_app_info"),
  getGitInfo: () => invoke<GitInfo>("get_git_info"),
  setGitIdentityField: (field: "user.name" | "user.email", value: string) =>
    invoke<GitInfo>("set_git_identity_field", { field, value }),
};
