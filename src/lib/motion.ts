/**
 * Shared motion presets aligned with cc-switch.
 * Durations/easings mirror the inline framer-motion + Tailwind conventions there.
 */

import type { Transition } from "framer-motion";

/** Page / modal content fade (App view switch). */
export const fadePage = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 } satisfies Transition,
} as const;

/** Fast content swap (app switcher / toolbar). */
export const fadeFast = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 } satisfies Transition,
} as const;

/** Settings tab panel enter (cc-switch SettingsPage TabsContent). */
export const settingsTabContent = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 } satisfies Transition,
} as const;

/** Collapse / expand panels (ProxyPanel, WindowSettings). */
export const collapse = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto" },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.25, ease: "easeInOut" } satisfies Transition,
} as const;

/**
 * Settings dialog body height morph when switching main / git / about.
 * easeInOut: in-place size change, not enter/exit.
 */
export const settingsResize = {
  transition: { duration: 0.28, ease: "easeInOut" } satisfies Transition,
} as const;

/** Settings pane content crossfade while the card resizes. */
export const settingsPane = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.2, ease: "easeOut" } satisfies Transition,
} as const;

/** Search / popover pop-in (ProviderList). */
export const searchPop = {
  initial: { opacity: 0, y: -8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.98 },
  transition: { duration: 0.18, ease: "easeOut" } satisfies Transition,
} as const;
