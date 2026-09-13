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
  remoteRenames: RemoteRename[];
};

export type BatchResult = {
  repos: RepoStatus[];
  remoteRenames: RemoteRename[];
};

/** A remote whose repository was renamed or transferred on the host. */
export type RemoteRename = {
  path: string;
  repoName: string;
  /** Remote name, e.g. `origin`. */
  remote: string;
  oldUrl: string;
  newUrl: string;
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

export type CommitRefKind = "head" | "local" | "remote" | "tag";

export type CommitRef = {
  name: string;
  kind: CommitRefKind | string;
};

export type CommitInfo = {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  parents: string[];
  refs: CommitRef[];
};

export type RepoDetail = {
  status: RepoStatus;
  remotes: RemoteInfo[];
  commits: CommitInfo[];
  changedFiles: string[];
};

export type ChangedFile = {
  path: string;
  origPath: string | null;
  kind:
    | "untracked"
    | "modified"
    | "added"
    | "deleted"
    | "renamed"
    | "copied"
    | "conflicted"
    | string;
  staged: boolean;
  unstaged: boolean;
  conflicted: boolean;
  indexStatus: string;
  worktreeStatus: string;
};

export type WorkspaceSnapshot = {
  status: RepoStatus;
  remotes: RemoteInfo[];
  operation: "normal" | "merge" | "rebase" | "cherryPick" | "revert" | string;
  files: ChangedFile[];
  canAmend: boolean;
};

export type DiffLine = {
  kind: "context" | "add" | "del" | string;
  text: string;
};

export type DiffHunk = {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
};

export type FileDiff = {
  path: string;
  header: string;
  binary: boolean;
  hunks: DiffHunk[];
};

export type HunkLineInput = {
  kind: string;
  text: string;
  selected: boolean;
};

export type BranchInfo = {
  name: string;
  hash: string;
  current: boolean;
  upstream: string | null;
  remote: boolean;
};

export type TagInfo = {
  name: string;
  hash: string;
  subject: string;
};

export type StashEntry = {
  index: number;
  selector: string;
  subject: string;
};

export type RepoRefs = {
  branches: BranchInfo[];
  tags: TagInfo[];
  stashes: StashEntry[];
};

export type BlameLine = {
  hash: string;
  author: string;
  date: string;
  line: string;
  number: number;
};

export type CommitDiff = {
  from: string;
  to: string;
  patch: string;
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
  defaultBranch: string | null;
  autocrlf: string | null;
  fetchPrune: boolean | null;
  pullFf: string | null;
  pushDefault: string | null;
  colorUi: string | null;
};

export type GitConfigField =
  | "init.defaultBranch"
  | "core.autocrlf"
  | "fetch.prune"
  | "pull.ff"
  | "push.default"
  | "color.ui";

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
  batchFetch: (paths: string[]) => invoke<BatchResult>("batch_fetch", { paths }),
  batchUpdate: (paths: string[]) => invoke<BatchResult>("batch_update", { paths }),
  repoDetail: (path: string) => invoke<RepoDetail>("repo_detail", { path }),
  addRemote: (path: string, name: string, url: string) =>
    invoke<RepoDetail>("add_remote", { path, name, url }),
  applyRemoteRename: (path: string, remote: string, url: string) =>
    invoke<RepoStatus>("apply_remote_rename", { path, remote, url }),
  dismissRemoteRename: (path: string, remote: string) =>
    invoke<void>("dismiss_remote_rename", { path, remote }),
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
  setGitConfigField: (field: GitConfigField, value: string) =>
    invoke<GitInfo>("set_git_config_field", { field, value }),
  cloneRepo: (url: string, dest: string) =>
    invoke<RepoStatus>("clone_repo", { url, dest }),
  initRepo: (path: string) => invoke<RepoStatus>("init_repo", { path }),
  workspaceSnapshot: (path: string) =>
    invoke<WorkspaceSnapshot>("workspace_snapshot", { path }),
  repoRefs: (path: string) => invoke<RepoRefs>("repo_refs", { path }),
  commitsPage: (path: string, skip = 0, limit = 50, search?: string) =>
    invoke<CommitInfo[]>("commits_page", {
      path,
      skip,
      limit,
      search: search ?? null,
    }),
  fileDiff: (path: string, filePath: string, staged = false) =>
    invoke<FileDiff>("file_diff", { path, filePath, staged }),
  stagePaths: (path: string, files: string[]) =>
    invoke<WorkspaceSnapshot>("stage_paths", { path, files }),
  unstagePaths: (path: string, files: string[]) =>
    invoke<WorkspaceSnapshot>("unstage_paths", { path, files }),
  discardPaths: (path: string, files: string[]) =>
    invoke<WorkspaceSnapshot>("discard_paths", { path, files }),
  commitRepo: (path: string, message: string, amend = false) =>
    invoke<WorkspaceSnapshot>("commit_repo", { path, message, amend }),
  pushRepo: (path: string, forceWithLease = false) =>
    invoke<WorkspaceSnapshot>("push_repo", { path, forceWithLease }),
  pullRepo: (path: string) => invoke<WorkspaceSnapshot>("pull_repo", { path }),
  fetchRepo: (path: string) => invoke<WorkspaceSnapshot>("fetch_repo", { path }),
  applyHunk: (
    path: string,
    filePath: string,
    fileHeader: string,
    hunkHeader: string,
    lines: HunkLineInput[],
    reverse = false,
  ) =>
    invoke<WorkspaceSnapshot>("apply_hunk", {
      path,
      filePath,
      fileHeader,
      hunkHeader,
      lines,
      reverse,
    }),
  createBranch: (path: string, name: string, checkout = true) =>
    invoke<WorkspaceSnapshot>("create_branch", { path, name, checkout }),
  checkoutRef: (path: string, name: string) =>
    invoke<WorkspaceSnapshot>("checkout_ref", { path, name }),
  renameBranch: (path: string, from: string, to: string) =>
    invoke<WorkspaceSnapshot>("rename_branch", { path, from, to }),
  deleteBranch: (path: string, name: string, force = false) =>
    invoke<WorkspaceSnapshot>("delete_branch", { path, name, force }),
  setUpstream: (path: string, branch: string, upstream: string) =>
    invoke<WorkspaceSnapshot>("set_upstream", { path, branch, upstream }),
  createTag: (path: string, name: string, message?: string, target?: string) =>
    invoke<WorkspaceSnapshot>("create_tag", {
      path,
      name,
      message: message ?? null,
      target: target ?? null,
    }),
  deleteTag: (path: string, name: string) =>
    invoke<WorkspaceSnapshot>("delete_tag", { path, name }),
  pushTags: (path: string) => invoke<WorkspaceSnapshot>("push_tags", { path }),
  mergeRef: (path: string, name: string) =>
    invoke<WorkspaceSnapshot>("merge_ref", { path, name }),
  rebaseOnto: (path: string, onto: string) =>
    invoke<WorkspaceSnapshot>("rebase_onto", { path, onto }),
  stashPush: (path: string, message?: string) =>
    invoke<WorkspaceSnapshot>("stash_push", { path, message: message ?? null }),
  stashApply: (path: string, selector: string, pop = false) =>
    invoke<WorkspaceSnapshot>("stash_apply", { path, selector, pop }),
  stashDrop: (path: string, selector: string) =>
    invoke<WorkspaceSnapshot>("stash_drop", { path, selector }),
  conflictTake: (path: string, filePath: string, side: "ours" | "theirs") =>
    invoke<WorkspaceSnapshot>("conflict_take", { path, filePath, side }),
  markResolved: (path: string, filePath: string) =>
    invoke<WorkspaceSnapshot>("mark_resolved", { path, filePath }),
  continueOperation: (path: string) =>
    invoke<WorkspaceSnapshot>("continue_operation", { path }),
  abortOperation: (path: string) =>
    invoke<WorkspaceSnapshot>("abort_operation", { path }),
  fileHistory: (path: string, filePath: string, skip = 0, limit = 50) =>
    invoke<CommitInfo[]>("file_history", { path, filePath, skip, limit }),
  blameFile: (path: string, filePath: string) =>
    invoke<BlameLine[]>("blame_file", { path, filePath }),
  commitPatch: (path: string, from: string, to: string) =>
    invoke<CommitDiff>("commit_patch", { path, from, to }),
  cherryPick: (path: string, hash: string) =>
    invoke<WorkspaceSnapshot>("cherry_pick", { path, hash }),
  revertCommit: (path: string, hash: string) =>
    invoke<WorkspaceSnapshot>("revert_commit", { path, hash }),
  resetTo: (path: string, hash: string, mode: "soft" | "mixed" | "hard") =>
    invoke<WorkspaceSnapshot>("reset_to", { path, hash, mode }),
};
