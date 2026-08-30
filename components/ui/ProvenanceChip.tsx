import type { DepMode } from "@/lib/engine/schemas";

/**
 * Provenance chip — SPEC §4 UI rule.
 * Every externally-derived datum carries one:
 *   live    → LIVE            (rubric — something happening right now)
 *   cached  → COLLATED HH:MM  (--ink-2)
 *   fixture → FROM THE RECORD (--ink-2)
 *
 * `model` names the exact model that produced the datum (SPEC §4: the OCR
 * chip names the model, e.g. "Qwen/Qwen3-VL-30B-A3B-Instruct · LIVE") —
 * which model read the page is provenance in the scholarly sense. When
 * present it prefixes the mode text; the mode's meaning (and its rubric-vs-
 * ink-2 color) is unchanged.
 */
export function ProvenanceChip({
  mode,
  collatedAt,
  model,
}: {
  mode: DepMode;
  /** Pre-formatted HH:MM, shown for mode="cached". */
  collatedAt?: string;
  /** Exact model id/name, e.g. an HF router model or a Gemini model id. */
  model?: string;
}) {
  const modeText =
    mode === "live"
      ? "LIVE"
      : mode === "cached"
        ? `COLLATED ${collatedAt ?? "--:--"}`
        : "FROM THE RECORD";
  const text = model ? `${model} · ${modeText}` : modeText;
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
