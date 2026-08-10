import { create } from "zustand";

export type FloatMetrics = {
  path: string;
  width: number;
  height: number;
  x: number;
  y: number;
};

type RepoGridState = {
  draggingPath: string | null;
  pressingPath: string | null;
  orderedPaths: string[] | null;
  floatMetrics: FloatMetrics | null;

  setDraggingPath: (path: string | null) => void;
  setPressingPath: (path: string | null) => void;
  setOrderedPaths: (paths: string[] | null) => void;
  setFloatMetrics: (metrics: FloatMetrics | null) => void;
  clearDragVisuals: () => void;
  reset: () => void;
};

export const useRepoGridStore = create<RepoGridState>((set) => ({
  draggingPath: null,
  pressingPath: null,
  orderedPaths: null,
  floatMetrics: null,

  setDraggingPath: (draggingPath) => set({ draggingPath }),
  setPressingPath: (pressingPath) => set({ pressingPath }),
  setOrderedPaths: (orderedPaths) => set({ orderedPaths }),
  setFloatMetrics: (floatMetrics) => set({ floatMetrics }),

  clearDragVisuals: () =>
    set({
      draggingPath: null,
      pressingPath: null,
      floatMetrics: null,
    }),

  reset: () =>
    set({
      draggingPath: null,
      pressingPath: null,
      orderedPaths: null,
      floatMetrics: null,
    }),
}));
