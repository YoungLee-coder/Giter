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
};

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

export type GithubPublishInfo = {
  available: boolean;
  login: string | null;
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
  refreshStatus: (paths?: string[]) =>
    invoke<RefreshResult>("refresh_status", { paths: paths ?? null }),
  scanFolder: (path: string, maxDepth?: number) =>
    invoke<RepoStatus[]>("scan_folder", {
      path,
      maxDepth: maxDepth ?? null,
    }),
  batchFetch: (paths: string[]) =>
    invoke<BatchProgress[]>("batch_fetch", { paths }),
  batchUpdate: (paths: string[]) =>
    invoke<BatchProgress[]>("batch_update", { paths }),
  repoDetail: (path: string) => invoke<RepoDetail>("repo_detail", { path }),
  addRemote: (path: string, name: string, url: string) =>
    invoke<RepoDetail>("add_remote", { path, name, url }),
  githubPublishInfo: () => invoke<GithubPublishInfo>("github_publish_info"),
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
};
