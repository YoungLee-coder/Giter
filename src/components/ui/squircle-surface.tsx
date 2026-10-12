import * as React from "react";
import { useSmoothCorners } from "@lisse/react";

import { cn } from "@/lib/utils";

/**
 * Background layer with continuous-curvature (squircle) corners, drawn by Lisse.
 *
 * Render it as the first child of a `.squircle-host` element. The host keeps its
 * layout, content and CSS `box-shadow`; this layer replaces its background and
 * border. The border is an SVG stroke in `currentColor`, coloured from the host's
 * `--squircle-border` in App.css, so hover / selected / theme changes stay in CSS.
 */
function SquircleSurface({
  radius = 12,
  className,
}: {
  /** Corner radius in px. Defaults to `--radius-lg` (0.75rem). */
  radius?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  useSmoothCorners(
    ref,
    { radius },
    {
      // Border and shadow are declared explicitly; nothing to lift from CSS.
      autoEffects: false,
      skipShadowHandle: true,
      effects: { innerBorder: { width: 1, color: "currentColor", opacity: 1 } },
    },
  );

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        "squircle-surface pointer-events-none absolute inset-0 -z-10 bg-card",
        className,
      )}
    />
  );
}

export { SquircleSurface };
