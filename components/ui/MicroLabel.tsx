import type { CSSProperties, ReactNode } from "react";

/**
 * Micro-label — DESIGN-BRIEF §6.
 * The Cataloguer's voice: mono, 11px, uppercase, letter-spacing .09em.
 * The only uppercase text in the system.
 * Tones: "ink" (default) · "dim" (--ink-2) · "live" (--rubric, for live states).
 */
export type MicroLabelTone = "ink" | "dim" | "live";

const toneColor: Record<MicroLabelTone, string> = {
  ink: "var(--ink)",
  dim: "var(--ink-2)",
  live: "var(--rubric)",
};

export function MicroLabel({
  children,
  tone = "ink",
  as: Tag = "span",
  htmlFor,
  style,
}: {
  children: ReactNode;
  tone?: MicroLabelTone;
  as?: "span" | "div" | "label" | "h2" | "h3";
  htmlFor?: string;
  style?: CSSProperties;
}) {
  return (
    <Tag
      htmlFor={htmlFor}
      style={{
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        fontSize: "var(--text-label)",
        letterSpacing: "0.09em",
        textTransform: "uppercase",
        color: toneColor[tone],
        margin: 0,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

/** Numbered form of the micro-label: ( N°01 ) — N° set in rubric mono. */
export function InstrumentNumber({
  n,
  tone = "live",
}: {
  n: string;
  tone?: MicroLabelTone;
}) {
  return (
    <MicroLabel tone={tone}>
      {"( N°"}
      {n}
      {" )"}
    </MicroLabel>
  );
}
