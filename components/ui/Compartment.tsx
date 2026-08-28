import type { CSSProperties, ReactNode } from "react";
import { MicroLabel } from "./MicroLabel";
import styles from "./compartment.module.css";

/**
 * Compartment — DESIGN-BRIEF §5/§6. Compartments, not cards:
 * 1px --hairline border, radius 0, no shadow, padding 24–40px.
 */
export function Compartment({
  label,
  children,
  hoverable = false,
  style,
}: {
  /** Optional micro-label header inside the cell. */
  label?: string;
  children?: ReactNode;
  /** Interactive cells get the --stock-2 hover. */
  hoverable?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={
        hoverable ? `${styles.compartment} ${styles.hoverable}` : styles.compartment
      }
      style={style}
    >
      {label ? (
        <MicroLabel
          tone="dim"
          as="h3"
          style={{ display: "block", marginBottom: "calc(var(--space-unit) * 2)" }}
        >
          {label}
        </MicroLabel>
      ) : null}
      {children}
    </div>
  );
}
