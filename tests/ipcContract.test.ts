import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

function readSrc(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Tauri IPC argument names", () => {
  it("keeps update_settings payload key as settings on both sides", () => {
    const rust = readSrc("src-tauri/src/commands.rs");
    const ts = readSrc("src/lib/tauri.ts");

    expect(rust).toMatch(
      /fn update_settings\(\s*app: AppHandle,\s*settings: AppSettings/,
    );
    expect(ts).toMatch(/invoke<AppSettings>\("update_settings", \{\s*settings\s*\}\)/);
  });

  it("does not register the old system_prefers_dark / os-theme watcher", () => {
    const rustLib = readSrc("src-tauri/src/lib.rs");
    const rustChrome = readSrc("src-tauri/src/window_chrome.rs");
    const theme = readSrc("src/lib/theme.ts");

    expect(rustLib).not.toMatch(/system_prefers_dark|start_os_theme_watch/);
    expect(rustChrome).not.toMatch(
      /system_prefers_dark|os-theme-changed|RegNotifyChangeKeyValue/,
    );
    expect(theme).not.toMatch(/system_prefers_dark|os-theme-changed/);
    expect(theme).toMatch(/setTheme\(theme === "system" \? null : theme\)/);
  });
});
