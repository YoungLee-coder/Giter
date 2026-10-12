import { useEffect, useRef, useState } from "react";

/**
 * Keeps a loading indicator on until its current cycle finishes (at least one),
 * so a fast operation reads as a completed turn instead of a flicker.
 */
export function useSpinCycles(active: boolean, periodMs: number): boolean {
  const [spinning, setSpinning] = useState(active);
  const startedAt = useRef(0);

  useEffect(() => {
    if (active) {
      startedAt.current = performance.now();
      setSpinning(true);
      return;
    }
    if (startedAt.current === 0) return;
    const elapsed = performance.now() - startedAt.current;
    const remaining = Math.max(1, Math.ceil(elapsed / periodMs)) * periodMs - elapsed;
    const id = window.setTimeout(() => setSpinning(false), remaining);
    return () => window.clearTimeout(id);
  }, [active, periodMs]);

  return active || spinning;
}
