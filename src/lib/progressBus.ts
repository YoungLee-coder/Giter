import type { BatchProgress } from "@/lib/tauri";
import { useAppStore } from "@/stores/appStore";

let pending: Record<string, BatchProgress> = {};
let rafId = 0;

function flush() {
  rafId = 0;
  const patch = pending;
  pending = {};
  if (Object.keys(patch).length === 0) return;
  useAppStore.getState().setProgress((prev) => ({ ...prev, ...patch }));
}

/** Coalesce high-frequency batch-progress events to one store write per frame. */
export function queueProgress(p: BatchProgress) {
  pending[p.path] = p;
  if (rafId) return;
  rafId = requestAnimationFrame(flush);
}

export function clearProgressQueue() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  pending = {};
}
