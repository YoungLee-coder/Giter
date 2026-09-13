export const queryKeys = {
  repos: ["repos"] as const,
  gitOk: ["gitOk"] as const,
  settings: ["settings"] as const,
  appInfo: ["appInfo"] as const,
  gitInfo: ["gitInfo"] as const,
  repoDetail: (path: string) => ["repoDetail", path] as const,
  workspace: (path: string) => ["workspace", path] as const,
  repoRefs: (path: string) => ["repoRefs", path] as const,
  commits: (path: string) => ["commits", path] as const,
  githubPublishInfo: ["githubPublishInfo"] as const,
};
