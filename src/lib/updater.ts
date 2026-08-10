import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const LAST_CHECK_KEY = "giter.lastUpdateCheckAt";
const DISMISSED_VERSION_KEY = "giter.dismissedUpdateVersion";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type UpdateProgress = {
  downloaded: number;
  contentLength: number | null;
};

export function shouldAutoCheckForUpdate(now = Date.now()): boolean {
  const raw = localStorage.getItem(LAST_CHECK_KEY);
  if (!raw) return true;
  const last = Number(raw);
  if (!Number.isFinite(last)) return true;
  return now - last >= CHECK_INTERVAL_MS;
}

export function markUpdateChecked(now = Date.now()): void {
  localStorage.setItem(LAST_CHECK_KEY, String(now));
}

export function getDismissedUpdateVersion(): string | null {
  return localStorage.getItem(DISMISSED_VERSION_KEY);
}

export function dismissUpdateVersion(version: string): void {
  localStorage.setItem(DISMISSED_VERSION_KEY, version);
}

export function clearDismissedUpdateVersion(): void {
  localStorage.removeItem(DISMISSED_VERSION_KEY);
}

export async function checkForAppUpdate(): Promise<Update | null> {
  return check();
}

export async function downloadAndInstallUpdate(
  update: Update,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  let downloaded = 0;
  let contentLength: number | null = null;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        contentLength = event.data.contentLength ?? null;
        onProgress?.({ downloaded, contentLength });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.({ downloaded, contentLength });
        break;
      case "Finished":
        onProgress?.({ downloaded, contentLength });
        break;
    }
  });
}

export async function relaunchApp(): Promise<void> {
  await relaunch();
}

export function formatUpdateError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}
