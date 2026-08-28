import type { DepMode } from "@/lib/engine/schemas";

/**
 * Provenance chip — SPEC §4 UI rule.
 * Every externally-derived datum carries one:
 *   live    → LIVE            (rubric — something happening right now)
 *   cached  → COLLATED HH:MM  (--ink-2)
 *   fixture → FROM THE RECORD (--ink-2)
 */
export function ProvenanceChip({
  mode,
  collatedAt,
}: {
  mode: DepMode;
  /** Pre-formatted HH:MM, shown for mode="cached". */
  collatedAt?: string;
}) {
  const text =
    mode === "live"
      ? "LIVE"
      : mode === "cached"
        ? `COLLATED ${collatedAt ?? "--:--"}`
        : "FROM THE RECORD";
  const color = mode === "live" ? "var(--rubric)" : "var(--ink-2)";
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        fontSize: "var(--text-label)",
        letterSpacing: "0.09em",
        textTransform: "uppercase",
        color,
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-input)",
        padding: "1px calc(var(--space-unit) * 0.75)",
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {text}
    </span>
  );
}
