import i18n from "@/i18n";

const STAGE_KEYS: Record<string, string> = {
  fetching: "stageFetching",
  refreshing: "stageRefreshing",
  done: "stageDone",
  error: "stageError",
  skipped: "stageSkipped",
};

const EXACT_MESSAGE_KEYS: Record<string, string> = {
  "Working tree is dirty": "msgWorkingTreeDirty",
  "No upstream branch": "msgNoUpstream",
  "Already up to date": "msgAlreadyUpToDate",
  Fetched: "msgFetched",
};

const FAST_FORWARD_RE = /^Fast-forwarded \(was behind by (\d+)\)$/;

export function translateStage(stage: string): string {
  const key = STAGE_KEYS[stage];
  return key ? i18n.t(key) : stage;
}

export function translateBackendMessage(
  message: string | null | undefined,
): string | null {
  if (!message) return null;
  const exact = EXACT_MESSAGE_KEYS[message];
  if (exact) return i18n.t(exact);
  const ff = message.match(FAST_FORWARD_RE);
  if (ff) return i18n.t("msgFastForwarded", { count: ff[1] });
  return message;
}
