import type { ReactNode } from "react";
import { RegMark } from "./RegMark";

/**
 * Folio header — DESIGN-BRIEF §5.
 * Left: wordmark or instrument name. Right: mono micro-labels
 * (INSTRUMENT (N°0X), document state, date) and the registration mark.
 * 1px hairline below. Every view opens with one.
 */
export function FolioHeader({
  left,
  right,
}: {
  left: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "calc(var(--space-unit) * 2)",
        padding: "calc(var(--space-unit) * 2) 0",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "calc(var(--space-unit) * 2)",
          minWidth: 0,
        }}
      >
        {left}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "calc(var(--space-unit) * 3)",
        }}
      >
        {right}
        <RegMark />
      </div>
    </header>
  );
}

/**
 * Instrument name for the folio header's left slot —
 * NAME set in the Architect's voice (Archivo 600, tight tracking).
 */
export function InstrumentName({ children }: { children: ReactNode }) {
  return (
    <h1
      style={{
        fontFamily: "var(--font-arch)",
        fontWeight: 600,
        fontSize: "var(--text-lead)",
        letterSpacing: "-0.02em",
        color: "var(--ink)",
        margin: 0,
      }}
    >
      {children}
    </h1>
  );
}

/**
 * Document state rendered as an XML attribute, in the §4 syntax theme:
 * attribute name in --ink-2, value in --blue.
 */
export function StateAttr({
  name = "status",
  value,
}: {
  name?: string;
  value: string;
}) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-mono)",
        color: "var(--ink-2)",
      }}
    >
      {name}
      {'="'}
      <span style={{ color: "var(--blue)" }}>{value}</span>
      {'"'}
    </span>
  );
}
