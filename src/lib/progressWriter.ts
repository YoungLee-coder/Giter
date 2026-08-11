import type { BatchProgress } from "@/lib/tauri";

type ProgressWriter = (
  progress:
    | Record<string, BatchProgress>
    | ((prev: Record<string, BatchProgress>) => Record<string, BatchProgress>),
) => void;

let progressWriter: ProgressWriter | null = null;

export function setProgressWriter(writer: ProgressWriter | null) {
  progressWriter = writer;
}

export function writeProgress(
  progress:
    | Record<string, BatchProgress>
    | ((prev: Record<string, BatchProgress>) => Record<string, BatchProgress>),
) {
  progressWriter?.(progress);
}
