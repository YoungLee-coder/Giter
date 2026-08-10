/**
 * Shared motion tokens — keep CSS vars in App.css in sync with duration values.
 * Framer Motion transitions live here; CSS still uses the ms vars for non-FM UI.
 */

import type { Transition } from "framer-motion";

export const MOTION_EASING = {
  /** Enter, press, drop — decelerate into rest. */
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  /** Soft ease-out for color / opacity micro-changes. */
  outSoft: "cubic-bezier(0.2, 0, 0, 1)",
  /** Exit only — accelerates out of view. */
  in: "cubic-bezier(0.4, 0, 1, 1)",
} as const;

/** Cubic bezier tuples for framer-motion `ease`. */
export const MOTION_EASE = {
  out: [0.16, 1, 0.3, 1] as const,
  outSoft: [0.2, 0, 0, 1] as const,
  in: [0.4, 0, 1, 1] as const,
};

export const MOTION_MS = {
  /** Press / active scale acknowledgment. */
  press: 100,
  /** Hover color, background, opacity. */
  color: 200,
  /** Tooltip / small popover. */
  popover: 150,
  /** Dropdown / select. */
  dropdown: 180,
  /** Modal overlay enter. */
  overlay: 200,
  /** Modal overlay exit (shorter than enter). */
  overlayOut: 140,
  /** Modal content enter. */
  dialog: 220,
  /** Modal content exit. */
  dialogOut: 150,
  /** Grid layout reorder duration hint. */
  flip: 280,
  /** Drag float settle into placeholder. */
  drop: 280,
  /** Stagger between grid cards on first paint. */
  stagger: 35,
} as const;

export const MOTION_SCALE = {
  press: 0.97,
  dialogFrom: 0.96,
} as const;

export const FM_TRANSITION = {
  overlay: {
    duration: MOTION_MS.overlay / 1000,
    ease: MOTION_EASE.out,
  } satisfies Transition,
  overlayOut: {
    duration: MOTION_MS.overlayOut / 1000,
    ease: MOTION_EASE.in,
  } satisfies Transition,
  dialog: {
    duration: MOTION_MS.dialog / 1000,
    ease: MOTION_EASE.out,
  } satisfies Transition,
  dialogOut: {
    duration: MOTION_MS.dialogOut / 1000,
    ease: MOTION_EASE.in,
  } satisfies Transition,
  card: {
    type: "spring",
    stiffness: 420,
    damping: 32,
    mass: 0.8,
  } satisfies Transition,
  /** Sibling cards sliding into vacated slots while reordering. */
  layout: {
    type: "spring",
    stiffness: 380,
    damping: 34,
    mass: 0.85,
  } satisfies Transition,
  /** Float card drop into placeholder. */
  floatDrop: {
    type: "spring",
    stiffness: 420,
    damping: 36,
    mass: 0.8,
  } satisfies Transition,
  cardColor: {
    duration: MOTION_MS.color / 1000,
    ease: MOTION_EASE.outSoft,
  } satisfies Transition,
  staggerItem: {
    duration: 0.28,
    ease: MOTION_EASE.out,
  } satisfies Transition,
} as const;
