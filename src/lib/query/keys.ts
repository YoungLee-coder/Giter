export const queryKeys = {
  repos: ["repos"] as const,
  gitOk: ["gitOk"] as const,
  settings: ["settings"] as const,
  appInfo: ["appInfo"] as const,
  gitInfo: ["gitInfo"] as const,
  repoDetail: (path: string) => ["repoDetail", path] as const,
  githubPublishInfo: ["githubPublishInfo"] as const,
};
