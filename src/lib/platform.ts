export const isMac = (): boolean => {
  try {
    const ua = navigator.userAgent || "";
    const plat = (navigator.platform || "").toLowerCase();
    return /mac/i.test(ua) || plat.includes("mac");
  } catch {
    return false;
  }
};

export const isWindows = (): boolean => {
  try {
    const ua = navigator.userAgent || "";
    return /windows|win32|win64/i.test(ua);
  } catch {
    return false;
  }
};

export const isLinux = (): boolean => {
  try {
    const ua = navigator.userAgent || "";
    return (
      /linux|x11/i.test(ua) && !/android/i.test(ua) && !isMac() && !isWindows()
    );
  } catch {
    return false;
  }
};

// Linux: disable drag regions (Wayland/GTK issues — Tauri #13440).
export const DRAG_REGION_ENABLED = !isLinux();

export const DRAG_REGION_ATTR: Record<string, unknown> = DRAG_REGION_ENABLED
  ? { "data-tauri-drag-region": true }
  : {};

export const DRAG_REGION_STYLE: Record<string, unknown> = DRAG_REGION_ENABLED
  ? { WebkitAppRegion: "drag" }
  : {};

/**
 * Top chrome inset above the app header.
 * - macOS: overlay title bar / traffic lights (matches cc-switch)
 * - Windows: breathing room under the window edge with Overlay chrome
 * - Linux: none (drag regions disabled — Tauri #13440)
 */
export const DEFAULT_DRAG_BAR_HEIGHT = isLinux() ? 0 : isWindows() ? 16 : 28;

export function getDragBarHeight(): number {
  return DEFAULT_DRAG_BAR_HEIGHT;
}
