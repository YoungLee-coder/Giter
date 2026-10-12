/**
 * Dev-only IPC stand-in so `pnpm dev` renders real-looking screens in a plain
 * browser (no Tauri shell). Loaded from `main.tsx` only when
 * `import.meta.env.DEV` is set and the Tauri runtime is absent; never bundled
 * into a release build.
 */
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type {
  AppSettings,
  BranchInfo,
  ChangedFile,
  CommitInfo,
  FileDiff,
  GitInfo,
  RepoRefs,
  RepoStatus,
  WorkspaceSnapshot,
} from "@/lib/tauri";

const HOME = "/Users/mira/Developer";

function repo(
  name: string,
  branch: string,
  provider: string | null,
  extra: Partial<RepoStatus> = {},
): RepoStatus {
  return {
    path: `${HOME}/${name}`,
    name,
    branch,
    upstream: provider ? `origin/${branch}` : null,
    ahead: 0,
    behind: 0,
    dirty: false,
    lastError: null,
    remoteProvider: provider,
    ...extra,
  };
}

let repos: RepoStatus[] = [
  repo("giter", "feat/redesign", "github", { ahead: 2, dirty: true }),
  repo("tidewater-api", "main", "github", { behind: 7 }),
  repo("kiln-design-tokens", "main", "github"),
  repo("harbor-infra", "release/2026.10", "gitlab", { ahead: 1, behind: 3 }),
  repo("lantern-docs", "main", "github", { dirty: true }),
  repo("fieldnotes", "draft/autumn-issue", null, { dirty: true }),
  repo("otter-cli", "main", "codeberg"),
  repo("saltmarsh-ios", "develop", "bitbucket", {
    behind: 12,
    lastError: "fatal: unable to access remote: Could not resolve host",
  }),
  repo("quarry-search", "main", "gitea", { ahead: 4 }),
  repo("print-shop-pos", "fix/receipt-rounding", "azure", { dirty: true, behind: 1 }),
  repo("dotfiles", "main", "github"),
  repo("weatherglass", "main", "other", { behind: 2 }),
];

let settings: AppSettings = { scanDepth: 3, concurrency: 4, theme: "system" };

const gitInfo: GitInfo = {
  available: true,
  version: "2.51.0",
  path: "/opt/homebrew/bin/git",
  execPath: "/opt/homebrew/opt/git/libexec/git-core",
  userName: "Mira Okonkwo",
  userEmail: "mira@tidewater.dev",
  defaultBranch: "main",
  autocrlf: "input",
  fetchPrune: true,
  pullFf: "only",
  pushDefault: "simple",
  colorUi: "auto",
};

function file(
  path: string,
  kind: string,
  staged: boolean,
  extra: Partial<ChangedFile> = {},
): ChangedFile {
  return {
    path,
    origPath: null,
    kind,
    staged,
    unstaged: !staged,
    conflicted: false,
    indexStatus: staged ? "M" : " ",
    worktreeStatus: staged ? " " : "M",
    ...extra,
  };
}

const files: ChangedFile[] = [
  file("src/App.css", "modified", true),
  file("src/components/repo/RepoCard.tsx", "modified", true),
  file("src/components/repo/FleetSummary.tsx", "added", true),
  file("src/App.tsx", "modified", false),
  file("src/components/workspace/WorkspacePage.tsx", "modified", false),
  file("src/i18n/locales/zh-CN.json", "modified", false),
  file("docs/design-notes.md", "untracked", false),
  file("src/components/repo/LegacyBadge.tsx", "deleted", false),
];

function snapshot(path: string): WorkspaceSnapshot {
  const status = repos.find((r) => r.path === path) ?? repos[0];
  return {
    status,
    remotes: status.remoteProvider
      ? [{ name: "origin", url: `git@github.com:tidewater/${status.name}.git` }]
      : [],
    operation: "normal",
    files: status.dirty ? files : [],
    canAmend: true,
  };
}

const AUTHORS = ["Mira Okonkwo", "Tomás Reyes", "Yuki Tanabe", "Ada Lindqvist"];
const SUBJECTS = [
  "feat(ui): fleet summary strip above the repo list",
  "fix(workspace): keep diff scroll position after staging a hunk",
  "refactor(css): move surface tokens to oklch",
  "Merge branch 'main' into feat/redesign",
  "fix(batch): explain why a dirty repo was skipped",
  "chore(deps): weekly dependency update",
  "feat(history): search commits by author",
  "style: tabular numerals for ahead and behind counts",
  "fix(windows): title bar colour follows the system theme",
  "docs: describe the two-lane safety model",
  "test: cover fast-forward refusal on diverged branches",
  "perf(grid): skip virtual rows that are offscreen",
];

function hash(n: number): string {
  let h = "";
  let x = Math.imul(n + 11, 2654435761) >>> 0;
  for (let i = 0; i < 40; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    h += ((x >>> 16) % 16).toString(16);
  }
  return h;
}

function commits(skip: number, limit: number): CommitInfo[] {
  const out: CommitInfo[] = [];
  for (let i = skip; i < Math.min(skip + limit, 64); i++) {
    const h = hash(i);
    const merge = i % 12 === 3;
    const side = i % 12 === 4 || i % 12 === 5;
    const parents = merge
      ? [hash(i + 1), hash(i + 3)]
      : side && i % 12 === 5
        ? [hash(i + 2)]
        : [hash(i + 1)];
    out.push({
      hash: h,
      shortHash: h.slice(0, 7),
      subject: SUBJECTS[i % SUBJECTS.length],
      author: AUTHORS[i % AUTHORS.length],
      date: new Date(Date.UTC(2026, 9, 12, 9, 40) - i * 7.3 * 3600_000).toISOString(),
      parents,
      refs:
        i === 0
          ? [
              { name: "feat/redesign", kind: "head" },
              { name: "origin/feat/redesign", kind: "remote" },
            ]
          : i === 3
            ? [
                { name: "main", kind: "local" },
                { name: "origin/main", kind: "remote" },
              ]
            : i === 9
              ? [{ name: "v0.5.15", kind: "tag" }]
              : [],
    });
  }
  return out;
}

function branch(name: string, extra: Partial<BranchInfo> = {}): BranchInfo {
  return {
    name,
    hash: hash(name.length).slice(0, 7),
    current: false,
    upstream: null,
    remote: false,
    ...extra,
  };
}

const refs: RepoRefs = {
  branches: [
    branch("feat/redesign", { current: true, upstream: "origin/feat/redesign" }),
    branch("main", { upstream: "origin/main" }),
    branch("fix/release-supply-chain", { upstream: "origin/fix/release-supply-chain" }),
    branch("spike/commit-graph-canvas"),
    branch("origin/main", { remote: true }),
    branch("origin/feat/redesign", { remote: true }),
    branch("origin/chore/deps-2026-10-11", { remote: true }),
  ],
  tags: [
    { name: "v0.5.15", hash: hash(9).slice(0, 7), subject: "weekly dependency update" },
    { name: "v0.5.14", hash: hash(21).slice(0, 7), subject: "weekly dependency update" },
    { name: "v0.5.10", hash: hash(40).slice(0, 7), subject: "single-repo workspace" },
  ],
  stashes: [
    { index: 0, selector: "stash@{0}", subject: "WIP on feat/redesign: sidebar spike" },
    { index: 1, selector: "stash@{1}", subject: "On main: local env tweaks" },
  ],
};

function diff(filePath: string): FileDiff {
  return {
    path: filePath,
    header: `diff --git a/${filePath} b/${filePath}`,
    binary: false,
    hunks: [
      {
        header: "@@ -41,9 +41,12 @@ export function RepoRow({ repo }: Props) {",
        oldStart: 41,
        oldCount: 9,
        newStart: 41,
        newCount: 12,
        lines: [
          { kind: "context", text: "  const { t } = useI18n();" },
          { kind: "context", text: "  return (" },
          { kind: "del", text: '    <div className="flex flex-col">' },
          { kind: "del", text: "      <Badge>{repo.branch}</Badge>" },
          { kind: "add", text: '    <div className="repo-row">' },
          {
            kind: "add",
            text: "      <SyncMeter ahead={repo.ahead} behind={repo.behind} />",
          },
          {
            kind: "add",
            text: '      <span className="repo-row__branch">{repo.branch}</span>',
          },
          { kind: "add", text: "      <StatusWord repo={repo} />" },
          { kind: "context", text: "    </div>" },
          { kind: "context", text: "  );" },
          { kind: "context", text: "}" },
        ],
      },
      {
        header: "@@ -88,6 +91,7 @@ function StatusWord({ repo }: { repo: RepoStatus }) {",
        oldStart: 88,
        oldCount: 6,
        newStart: 91,
        newCount: 7,
        lines: [
          {
            kind: "context",
            text: "  if (repo.lastError) return <span>{t('error')}</span>;",
          },
          {
            kind: "add",
            text: "  if (!repo.upstream) return <span>{t('noUpstream')}</span>;",
          },
          {
            kind: "context",
            text: "  if (repo.dirty) return <span>{t('dirty')}</span>;",
          },
          { kind: "context", text: "  return <span>{t('clean')}</span>;" },
        ],
      },
    ],
  };
}

const PATCH = `diff --git a/src/App.css b/src/App.css
index 3f1c2aa..9b04d1e 100644
--- a/src/App.css
+++ b/src/App.css
@@ -45,7 +45,8 @@
 :root {
   color-scheme: light;
-  --background: #ffffff;
+  --background: oklch(0.985 0.003 250);
+  --surface: oklch(1 0 0);
   --foreground: rgba(0, 0, 0, 0.86);
`;

type Args = Record<string, unknown>;

function handle(cmd: string, args: Args): unknown {
  const path = typeof args.path === "string" ? args.path : repos[0].path;
  switch (cmd) {
    case "check_git":
      return true;
    case "list_repos":
      return repos;
    case "refresh_status":
      return { repos, removed: [], remoteRenames: [] };
    case "batch_fetch":
      return { repos, remoteRenames: [] };
    case "batch_update": {
      // Same skip rules as the real fleet lane: only clean repos fast-forward.
      const targets = new Set(args.paths as string[]);
      repos = repos.map((r) =>
        targets.has(r.path) && !r.dirty && !r.lastError ? { ...r, behind: 0 } : r,
      );
      return { repos, remoteRenames: [] };
    }
    case "reorder_repos": {
      const order = args.paths as string[];
      repos = order
        .map((p) => repos.find((r) => r.path === p))
        .filter((r): r is RepoStatus => Boolean(r));
      return null;
    }
    case "remove_repos": {
      const gone = new Set(args.paths as string[]);
      repos = repos.filter((r) => !gone.has(r.path));
      return null;
    }
    case "get_settings":
      return settings;
    case "update_settings":
      settings = args.settings as AppSettings;
      return settings;
    case "get_app_info":
      return { name: "Giter", version: "0.5.15", gitAvailable: true };
    case "get_git_info":
    case "set_git_identity_field":
    case "set_git_config_field":
      return gitInfo;
    case "github_publish_info":
      return { available: true, login: "mira-okonkwo", gitProtocol: "ssh" };
    case "repo_detail":
      return {
        status: snapshot(path).status,
        remotes: snapshot(path).remotes,
        commits: commits(0, 30),
        changedFiles: files.map((f) => f.path),
      };
    case "repo_refs":
      return refs;
    case "commits_page":
    case "file_history":
      return commits(Number(args.skip ?? 0), Number(args.limit ?? 50));
    case "file_diff":
      return diff(String(args.filePath ?? "src/App.tsx"));
    case "commit_patch":
      return { from: String(args.from), to: String(args.to), patch: PATCH };
    case "blame_file":
      return [];
    case "plugin:event|listen":
      return 0;
    case "plugin:app|version":
      return "0.5.15";
    default:
      // Workspace commands all answer with a fresh snapshot.
      if (typeof args.path === "string" && !cmd.startsWith("plugin:")) {
        return snapshot(path);
      }
      return null;
  }
}

export function installBrowserMock() {
  mockWindows("main");
  mockIPC((cmd, payload) => handle(cmd, (payload ?? {}) as Args));
}
