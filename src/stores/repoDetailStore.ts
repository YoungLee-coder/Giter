import { startTransition } from "react";
import { create } from "zustand";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  api,
  type GithubPublishInfo,
  type RepoDetail,
  type RepoStatus,
} from "@/lib/tauri";

export type RemoteMode = "idle" | "publish" | "addUrl";

type RepoDetailState = {
  detail: RepoDetail | null;
  loading: boolean;
  error: string | null;
  remoteMode: RemoteMode;
  publishName: string;
  publishInfo: GithubPublishInfo | null;
  publishInfoLoading: boolean;
  publishing: boolean;
  remoteName: string;
  remoteUrl: string;
  savingRemote: boolean;

  setError: (error: string | null) => void;
  setRemoteMode: (mode: RemoteMode) => void;
  setPublishName: (name: string) => void;
  setRemoteName: (name: string) => void;
  setRemoteUrl: (url: string) => void;
  reset: () => void;
  resetRemoteForm: (repoName?: string) => void;
  openRepo: (repo: RepoStatus) => Promise<void>;
  loadPublishInfo: () => Promise<void>;
  reveal: (path: string) => Promise<void>;
  publish: (path: string, privateRepo: boolean) => Promise<void>;
  addRemote: (path: string) => Promise<void>;
};

const initialRemote = {
  remoteMode: "idle" as RemoteMode,
  publishName: "",
  publishInfo: null as GithubPublishInfo | null,
  publishInfoLoading: false,
  publishing: false,
  remoteName: "origin",
  remoteUrl: "",
  savingRemote: false,
};

let detailLoadSeq = 0;
let publishInfoSeq = 0;

export const useRepoDetailStore = create<RepoDetailState>((set, get) => ({
  detail: null,
  loading: false,
  error: null,
  ...initialRemote,

  setError: (error) => set({ error }),
  setRemoteMode: (remoteMode) => set({ remoteMode }),
  setPublishName: (publishName) => set({ publishName }),
  setRemoteName: (remoteName) => set({ remoteName }),
  setRemoteUrl: (remoteUrl) => set({ remoteUrl }),

  reset: () => {
    detailLoadSeq += 1;
    publishInfoSeq += 1;
    set({
      detail: null,
      loading: false,
      error: null,
      ...initialRemote,
    });
  },

  resetRemoteForm: (repoName) =>
    set({
      ...initialRemote,
      publishName: repoName ?? "",
    }),

  openRepo: async (repo) => {
    const seq = ++detailLoadSeq;
    set({
      loading: true,
      error: null,
      detail: null,
      ...initialRemote,
      publishName: repo.name,
    });
    try {
      const result = await api.repoDetail(repo.path);
      if (seq !== detailLoadSeq) return;
      // Keep the enter animation on the compositor; hydrate detail as a transition.
      startTransition(() => {
        if (seq !== detailLoadSeq) return;
        set({ detail: result, loading: false });
      });
    } catch (e) {
      if (seq !== detailLoadSeq) return;
      set({ error: String(e), loading: false });
    }
  },

  loadPublishInfo: async () => {
    const seq = ++publishInfoSeq;
    set({ publishInfoLoading: true });
    try {
      const info = await api.githubPublishInfo();
      if (seq !== publishInfoSeq) return;
      set({ publishInfo: info });
    } catch (e) {
      if (seq !== publishInfoSeq) return;
      set({
        publishInfo: { available: false, login: null },
        error: String(e),
      });
    } finally {
      if (seq === publishInfoSeq) set({ publishInfoLoading: false });
    }
  },

  reveal: async (path) => {
    try {
      await revealItemInDir(path);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  publish: async (path, privateRepo) => {
    const name = get().publishName.trim();
    if (!name || get().publishing) return;

    set({ publishing: true, error: null });
    try {
      const result = await api.publishToGithub(path, name, privateRepo);
      set({ detail: result });
      get().resetRemoteForm();
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ publishing: false });
    }
  },

  addRemote: async (path) => {
    const name = get().remoteName.trim();
    const url = get().remoteUrl.trim();
    if (!name || !url || get().savingRemote) return;

    set({ savingRemote: true, error: null });
    try {
      const result = await api.addRemote(path, name, url);
      set({ detail: result });
      get().resetRemoteForm();
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ savingRemote: false });
    }
  },
}));
