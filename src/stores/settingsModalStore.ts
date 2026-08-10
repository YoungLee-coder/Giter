import { create } from "zustand";
import type { Update } from "@tauri-apps/plugin-updater";
import { api, type AppInfo, type GitInfo } from "@/lib/tauri";
import {
  checkForAppUpdate,
  clearDismissedUpdateVersion,
  downloadAndInstallUpdate,
  formatUpdateError,
  markUpdateChecked,
  relaunchApp,
} from "@/lib/updater";
import { useSettingsStore } from "@/stores/settingsStore";

export type SettingsPane = "main" | "git" | "about";

export type UpdateUiState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; update: Update; percent: number }
  | { kind: "installing"; update: Update }
  | { kind: "error"; message: string };

export type SettingsModalState = {
  pane: SettingsPane;
  appInfo: AppInfo | null;
  gitInfo: GitInfo | null;
  gitLoading: boolean;
  scanDepthDraft: string;
  concurrencyDraft: string;
  updateState: UpdateUiState;

  setPane: (pane: SettingsPane) => void;
  setScanDepthDraft: (value: string) => void;
  setConcurrencyDraft: (value: string) => void;
  resetOnClose: () => void;
  syncDraftsFromSettings: () => void;
  loadAppInfo: () => Promise<void>;
  loadGitInfo: () => Promise<void>;
  commitNumber: (
    field: "scanDepth" | "concurrency",
    raw: string,
    min: number,
    max: number,
    fallback: number,
  ) => void;
  checkForUpdates: () => Promise<void>;
  installUpdate: (update: Update) => Promise<void>;
};

let appInfoSeq = 0;
let gitInfoSeq = 0;

export const useSettingsModalStore = create<SettingsModalState>((set) => ({
  pane: "main",
  appInfo: null,
  gitInfo: null,
  gitLoading: false,
  scanDepthDraft: String(useSettingsStore.getState().settings.scanDepth),
  concurrencyDraft: String(useSettingsStore.getState().settings.concurrency),
  updateState: { kind: "idle" },

  setPane: (pane) => set({ pane }),
  setScanDepthDraft: (scanDepthDraft) => set({ scanDepthDraft }),
  setConcurrencyDraft: (concurrencyDraft) => set({ concurrencyDraft }),

  resetOnClose: () => {
    set({
      pane: "main",
      updateState: { kind: "idle" },
    });
  },

  syncDraftsFromSettings: () => {
    const { settings } = useSettingsStore.getState();
    set({
      scanDepthDraft: String(settings.scanDepth),
      concurrencyDraft: String(settings.concurrency),
    });
  },

  loadAppInfo: async () => {
    const seq = ++appInfoSeq;
    try {
      const info = await api.getAppInfo();
      if (seq !== appInfoSeq) return;
      set({ appInfo: info });
    } catch {
      if (seq !== appInfoSeq) return;
      set({ appInfo: null });
    }
  },

  loadGitInfo: async () => {
    const seq = ++gitInfoSeq;
    const cached = useSettingsModalStore.getState().gitInfo;
    if (!cached) set({ gitLoading: true });
    try {
      const info = await api.getGitInfo();
      if (seq !== gitInfoSeq) return;
      set({ gitInfo: info });
    } catch {
      if (seq !== gitInfoSeq) return;
      set({ gitInfo: null });
    } finally {
      if (seq === gitInfoSeq) set({ gitLoading: false });
    }
  },

  commitNumber: (field, raw, min, max, fallback) => {
    const parsed = Number.parseInt(raw, 10);
    const value = Number.isFinite(parsed)
      ? Math.min(max, Math.max(min, parsed))
      : fallback;
    if (field === "scanDepth") set({ scanDepthDraft: String(value) });
    else set({ concurrencyDraft: String(value) });
    const { settings, updateSettings } = useSettingsStore.getState();
    if (settings[field] !== value) {
      void updateSettings({ [field]: value });
    }
  },

  checkForUpdates: async () => {
    set({ updateState: { kind: "checking" } });
    markUpdateChecked();
    try {
      const update = await checkForAppUpdate();
      if (!update) {
        set({ updateState: { kind: "upToDate" } });
        return;
      }
      clearDismissedUpdateVersion();
      set({ updateState: { kind: "available", update } });
    } catch (error) {
      set({
        updateState: { kind: "error", message: formatUpdateError(error) },
      });
    }
  },

  installUpdate: async (update) => {
    set({ updateState: { kind: "downloading", update, percent: 0 } });
    try {
      await downloadAndInstallUpdate(update, ({ downloaded, contentLength }) => {
        const percent =
          contentLength && contentLength > 0
            ? Math.min(100, Math.round((downloaded / contentLength) * 100))
            : 0;
        set({ updateState: { kind: "downloading", update, percent } });
      });
      set({ updateState: { kind: "installing", update } });
      await relaunchApp();
    } catch (error) {
      set({
        updateState: { kind: "error", message: formatUpdateError(error) },
      });
    }
  },
}));
