import { beforeEach, describe, expect, it, vi } from "vitest";

const setTheme = vi.fn().mockResolvedValue(undefined);
const onThemeChanged = vi.fn().mockResolvedValue(() => undefined);
const invoke = vi.fn().mockResolvedValue(undefined);

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTheme, onThemeChanged }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

vi.mock("@/lib/tauri", () => ({
  DEFAULT_SETTINGS: { scanDepth: 3, concurrency: 4, theme: "system" },
  api: { getSettings: vi.fn() },
}));

function mockMatchMedia(dark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mql = {
    matches: dark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_event: string, cb: (event: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_event: string, cb: (event: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    },
  };
  window.matchMedia = () => mql as unknown as MediaQueryList;
  return { listeners, mql };
}

describe("applyTheme", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    delete document.documentElement.dataset.theme;
    setTheme.mockClear();
    invoke.mockClear();
    onThemeChanged.mockClear();
  });

  it("forces dark class and native dark theme", async () => {
    mockMatchMedia(false);
    const { applyTheme } = await import("@/lib/theme");
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    await vi.waitFor(() => {
      expect(setTheme).toHaveBeenCalledWith("dark");
      expect(invoke).toHaveBeenCalledWith("sync_window_chrome", { dark: true });
    });
  });

  it("forces light class even when OS is dark", async () => {
    mockMatchMedia(true);
    const { applyTheme } = await import("@/lib/theme");
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
    await vi.waitFor(() => {
      expect(setTheme).toHaveBeenCalledWith("light");
      expect(invoke).toHaveBeenCalledWith("sync_window_chrome", { dark: false });
    });
  });

  it("follows matchMedia and restores Auto with setTheme(null)", async () => {
    mockMatchMedia(true);
    const { applyTheme } = await import("@/lib/theme");
    applyTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    await vi.waitFor(() => {
      expect(setTheme).toHaveBeenCalledWith(null);
      expect(invoke).toHaveBeenCalledWith("sync_window_chrome", { dark: true });
    });
  });
});

describe("syncSystemThemeListener", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    delete document.documentElement.dataset.theme;
    setTheme.mockClear();
    invoke.mockClear();
  });

  it("repaints from matchMedia without calling setTheme again", async () => {
    const { listeners, mql } = mockMatchMedia(false);
    const { applyTheme, syncSystemThemeListener } = await import("@/lib/theme");
    applyTheme("system");
    syncSystemThemeListener("system");
    await vi.waitFor(() => {
      expect(setTheme).toHaveBeenCalledWith(null);
      expect(invoke).toHaveBeenCalled();
    });
    setTheme.mockClear();
    invoke.mockClear();

    mql.matches = true;
    for (const listener of listeners) {
      listener({ matches: true } as MediaQueryListEvent);
    }

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(setTheme).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("sync_window_chrome", { dark: true });
  });
});
