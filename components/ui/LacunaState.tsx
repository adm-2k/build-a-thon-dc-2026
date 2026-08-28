import type { ReactNode } from "react";

/**
 * Lacuna — DESIGN-BRIEF §8, verbatim: "LACUNA — nothing recorded here yet."
 * The empty state for every region that has no data. Never a spinner.
 */
export function LacunaState({
  note,
  compact = false,
}: {
  /** Optional secondary line under the verbatim lacuna copy. */
  note?: ReactNode;
  /** Compact form for margins and cells (no padding block). */
  compact?: boolean;
}) {
  return (
    <div
      style={{
        padding: compact ? 0 : "calc(var(--space-unit) * 4) 0",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-unit)",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-mono)",
          color: "var(--ink-2)",
          margin: 0,
        }}
      >
        LACUNA — nothing recorded here yet.
      </p>
      {note ? (
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-mono)",
            color: "var(--ink-2)",
            margin: 0,
            maxWidth: "65ch",
          }}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Wait state — DESIGN-BRIEF §8, verbatim: "COLLATING…"
 * Rendered as a status line, never a spinner or skeleton shimmer.
 */
export function CollatingState() {
  return (
    <p
      style={{
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        fontSize: "var(--text-label)",
        letterSpacing: "0.09em",
        textTransform: "uppercase",
        color: "var(--rubric)",
        margin: 0,
      }}
      role="status"
    >
      COLLATING…
    </p>
  );
}
