import type { ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";

function LegendShell({ children }: { children: ReactNode }) {
  return (
    <div className="git-config-legend" aria-hidden="true">
      {children}
    </div>
  );
}

function Chip({
  children,
  tone = "muted",
  strike = false,
}: {
  children: ReactNode;
  tone?: "lf" | "crlf" | "ok" | "head" | "remote" | "muted" | "warn";
  strike?: boolean;
}) {
  return (
    <span
      className={cn(
        "git-legend-chip",
        `git-legend-chip--${tone}`,
        strike && "git-legend-chip--strike",
      )}
    >
      {children}
    </span>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <span className="git-legend-arrow">
      {label ? <span className="git-legend-arrow-label">{label}</span> : null}
      <span className="git-legend-arrow-line" />
    </span>
  );
}

function GraphNode({
  x,
  y,
  tone = "muted",
  head = false,
}: {
  x: number;
  y: number;
  tone?: "head" | "remote" | "ok" | "warn" | "muted";
  head?: boolean;
}) {
  const r = head ? 5 : 4;
  return (
    <circle
      cx={x}
      cy={y}
      r={r}
      className={cn(
        "git-legend-node",
        `git-legend-node--${tone}`,
        head && "git-legend-node--head",
      )}
    />
  );
}

export function LineEndingLegend({ mode }: { mode: "false" | "input" | "true" }) {
  const { t } = useI18n();
  const workingIn = "CRLF";
  const repo = mode === "false" ? "CRLF" : "LF";
  const workingOut = mode === "true" || mode === "false" ? "CRLF" : "LF";
  const tone = (value: string) => (value === "CRLF" ? "crlf" : "lf");

  return (
    <LegendShell>
      <div className="git-legend-flow">
        <div className="git-legend-col">
          <span className="git-legend-kicker">{t("gitConfigLegendWorking")}</span>
          <Chip tone={tone(workingIn)}>{workingIn}</Chip>
        </div>
        <Arrow label="commit" />
        <div className="git-legend-col">
          <span className="git-legend-kicker">{t("gitConfigLegendRepo")}</span>
          <Chip tone={tone(repo)}>{repo}</Chip>
        </div>
        <Arrow label="checkout" />
        <div className="git-legend-col">
          <span className="git-legend-kicker">{t("gitConfigLegendWorking")}</span>
          <Chip tone={tone(workingOut)}>{workingOut}</Chip>
        </div>
      </div>
    </LegendShell>
  );
}

export function FetchPruneLegend({ prune }: { prune: boolean }) {
  const { t } = useI18n();

  return (
    <LegendShell>
      <div className="git-legend-stack">
        <div className="git-legend-row">
          <span className="git-legend-kicker git-legend-kicker--row">
            {t("gitConfigLegendRemote")}
          </span>
          <Chip tone="ok">main</Chip>
          <Chip tone="muted" strike>
            feat
          </Chip>
          <span className="git-legend-note">{t("gitConfigLegendGone")}</span>
        </div>
        <div className="git-legend-row">
          <span className="git-legend-kicker git-legend-kicker--row">
            {t("gitConfigLegendTracking")}
          </span>
          <Chip tone="remote">origin/main</Chip>
          <Chip tone={prune ? "muted" : "warn"} strike={prune}>
            origin/feat
          </Chip>
          <span className="git-legend-note">
            {prune ? t("gitConfigLegendPruned") : t("gitConfigLegendKept")}
          </span>
        </div>
      </div>
    </LegendShell>
  );
}

function MiniGraph({
  kind,
  caption,
}: {
  kind: "ff" | "merge" | "refuse" | "noff";
  caption: string;
}) {
  return (
    <div className="git-legend-graph-wrap">
      <svg viewBox="0 0 120 48" className="git-legend-graph">
        {kind === "ff" || kind === "noff" ? (
          <>
            <path d="M10 24 H110" className="git-legend-edge" />
            <GraphNode x={10} y={24} />
            <GraphNode x={60} y={24} />
            {kind === "ff" ? (
              <GraphNode x={110} y={24} tone="head" head />
            ) : (
              <>
                <path
                  d="M110 24 C110 10 78 8 60 8 H36"
                  className="git-legend-edge git-legend-edge--merge"
                />
                <GraphNode x={36} y={8} tone="remote" />
                <GraphNode x={110} y={24} tone="head" head />
              </>
            )}
          </>
        ) : null}
        {kind === "merge" ? (
          <>
            <path d="M10 34 H70" className="git-legend-edge" />
            <path
              d="M10 34 C18 34 22 12 36 12 H78"
              className="git-legend-edge git-legend-edge--remote"
            />
            <path
              d="M70 34 C86 34 94 12 110 12"
              className="git-legend-edge git-legend-edge--merge"
            />
            <path d="M78 12 H110" className="git-legend-edge git-legend-edge--remote" />
            <GraphNode x={10} y={34} />
            <GraphNode x={70} y={34} />
            <GraphNode x={36} y={12} tone="remote" />
            <GraphNode x={78} y={12} tone="remote" />
            <GraphNode x={110} y={12} tone="head" head />
          </>
        ) : null}
        {kind === "refuse" ? (
          <>
            <path d="M10 34 H62" className="git-legend-edge" />
            <path
              d="M10 34 C18 34 22 12 36 12 H110"
              className="git-legend-edge git-legend-edge--remote"
            />
            <GraphNode x={10} y={34} />
            <GraphNode x={62} y={34} tone="head" head />
            <GraphNode x={36} y={12} tone="remote" />
            <GraphNode x={74} y={12} tone="remote" />
            <GraphNode x={110} y={12} tone="remote" />
            <path
              d="M68 20 L84 36 M84 20 L68 36"
              className="git-legend-edge git-legend-edge--refuse"
            />
          </>
        ) : null}
      </svg>
      <span className="git-legend-caption">{caption}</span>
    </div>
  );
}

export function PullFfLegend({ mode }: { mode: "true" | "only" | "false" }) {
  const { t } = useI18n();

  if (mode === "true") {
    return (
      <LegendShell>
        <div className="git-legend-graphs">
          <MiniGraph kind="ff" caption={t("gitConfigLegendFfOk")} />
          <MiniGraph kind="merge" caption={t("gitConfigLegendMerge")} />
        </div>
      </LegendShell>
    );
  }
  if (mode === "only") {
    return (
      <LegendShell>
        <div className="git-legend-graphs">
          <MiniGraph kind="ff" caption={t("gitConfigLegendFfOk")} />
          <MiniGraph kind="refuse" caption={t("gitConfigLegendRefuse")} />
        </div>
      </LegendShell>
    );
  }
  return (
    <LegendShell>
      <div className="git-legend-graphs">
        <MiniGraph kind="noff" caption={t("gitConfigLegendNoFf")} />
        <MiniGraph kind="merge" caption={t("gitConfigLegendMerge")} />
      </div>
    </LegendShell>
  );
}

export function PushDefaultLegend({ mode }: { mode: "simple" | "current" | "upstream" }) {
  const { t } = useI18n();

  return (
    <LegendShell>
      <div className="git-legend-stack">
        <div className="git-legend-row">
          <span className="git-legend-kicker git-legend-kicker--row">
            {t("gitConfigLegendSameName")}
          </span>
          <Chip tone="head">main</Chip>
          <Arrow />
          <Chip tone="remote">origin/main</Chip>
          <span className="git-legend-note git-legend-note--ok">✓</span>
        </div>
        <div className="git-legend-row">
          <span className="git-legend-kicker git-legend-kicker--row">
            {t("gitConfigLegendDifferentName")}
          </span>
          <Chip tone="head">feat</Chip>
          {mode === "simple" ? (
            <>
              <Arrow />
              <Chip tone="muted" strike>
                origin/main
              </Chip>
              <span className="git-legend-note">{t("gitConfigLegendSkip")}</span>
            </>
          ) : null}
          {mode === "current" ? (
            <>
              <Arrow />
              <Chip tone="ok">origin/feat</Chip>
              <span className="git-legend-note">{t("gitConfigLegendCreate")}</span>
            </>
          ) : null}
          {mode === "upstream" ? (
            <>
              <Arrow />
              <Chip tone="remote">origin/main</Chip>
              <span className="git-legend-note">{t("gitConfigLegendUpstream")}</span>
            </>
          ) : null}
        </div>
      </div>
    </LegendShell>
  );
}

export function ColorUiLegend({ mode }: { mode: "auto" | "always" | "never" }) {
  const { t } = useI18n();
  const termColor = mode !== "never";
  const pipeColor = mode === "always";

  return (
    <LegendShell>
      <div className="git-legend-terms">
        <div className="git-legend-term">
          <span className="git-legend-kicker">{t("gitConfigLegendTerminal")}</span>
          <code className={cn("git-legend-term-body", termColor && "is-colored")}>
            <span className="git-legend-add">+ foo</span>
            <span className="git-legend-del">− bar</span>
          </code>
        </div>
        <div className="git-legend-term">
          <span className="git-legend-kicker">{t("gitConfigLegendPiped")}</span>
          <code
            className={cn(
              "git-legend-term-body",
              pipeColor && "is-colored",
              pipeColor && "is-ansi",
            )}
          >
            {pipeColor ? <span className="git-legend-ansi">[32m</span> : null}
            <span className="git-legend-add">+ foo</span>
            <span className="git-legend-del">− bar</span>
          </code>
        </div>
      </div>
    </LegendShell>
  );
}
