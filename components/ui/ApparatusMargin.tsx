import type { ReactNode } from "react";
import { MicroLabel } from "./MicroLabel";
import styles from "./apparatus-margin.module.css";

/**
 * Apparatus margin — DESIGN-BRIEF §5.
 * The scholar's margin: controls, annotations, validation. Mono voice, dense.
 * Place inside a `display: flex; flex-wrap: wrap` row next to the text block.
 */
export function ApparatusMargin({
  title = "Apparatus",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <aside className={styles.margin} aria-label={title}>
      <MicroLabel tone="dim" as="h2">
        {title}
      </MicroLabel>
      {children}
    </aside>
  );
}

/** A titled section within the margin. */
export function MarginSection({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-unit)",
        borderTop: "1px solid var(--hairline)",
        paddingTop: "calc(var(--space-unit) * 2)",
      }}
    >
      <MicroLabel tone="dim" as="h3">
        {label}
      </MicroLabel>
      {children}
    </section>
  );
}
