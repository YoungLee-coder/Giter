import type { RepoStatus } from "@/lib/tauri";

/** Fleet buckets shown above the repo list; each one doubles as a filter. */
export const FLEET_FILTERS = ["all", "behind", "ahead", "dirty", "error"] as const;

export type FleetFilter = (typeof FLEET_FILTERS)[number];

export function matchesFleetFilter(repo: RepoStatus, filter: FleetFilter): boolean {
  switch (filter) {
    case "behind":
      return repo.behind > 0;
    case "ahead":
      return repo.ahead > 0;
    case "dirty":
      return repo.dirty;
    case "error":
      return Boolean(repo.lastError);
    default:
      return true;
  }
}

export function countFleet(repos: RepoStatus[]): Record<FleetFilter, number> {
  const counts: Record<FleetFilter, number> = {
    all: repos.length,
    behind: 0,
    ahead: 0,
    dirty: 0,
    error: 0,
  };
  for (const repo of repos) {
    if (repo.behind > 0) counts.behind += 1;
    if (repo.ahead > 0) counts.ahead += 1;
    if (repo.dirty) counts.dirty += 1;
    if (repo.lastError) counts.error += 1;
  }
  return counts;
}

export function matchesFleetQuery(repo: RepoStatus, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    repo.name.toLowerCase().includes(needle) ||
    (repo.branch ?? "").toLowerCase().includes(needle) ||
    repo.path.toLowerCase().includes(needle)
  );
}

/** Ledger sections, in the order they need attention. */
export const FLEET_SECTIONS = ["error", "behind", "rest"] as const;

export type FleetSection = (typeof FLEET_SECTIONS)[number];

export function fleetSectionOf(repo: RepoStatus): FleetSection {
  if (repo.lastError) return "error";
  if (repo.behind > 0) return "behind";
  return "rest";
}

/** Mirrors the fleet lane's skip rules: only clean repos with an upstream fast-forward. */
export function canFastForward(repo: RepoStatus): boolean {
  return repo.behind > 0 && !repo.dirty && !repo.lastError && Boolean(repo.upstream);
}

/** Collapse the home directory so the distinguishing tail of a path survives truncation. */
export function displayPath(path: string): string {
  return path.replace(/^(?:\/Users|\/home)\/[^/]+|^[A-Za-z]:\\Users\\[^\\]+/, "~");
}
