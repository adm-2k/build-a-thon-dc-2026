import styles from "./event-stamp.module.css";

/**
 * Event stamp — DESIGN-BRIEF §6.
 * Circular SVG roundel: "DEVFESTDC 2026 · WASHINGTON D.C. ·" on a text-path,
 * `</>` centered, stroke and type in --rubric, 1–1.5px strokes.
 * Colophon and splash only. Optional 60s linear rotation (reduced-motion kills it).
 */
export function EventStamp({
  size = 64,
  spin = false,
}: {
  size?: number;
  spin?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      className={spin ? styles.spin : undefined}
      style={{ color: "var(--rubric)", flex: "none" }}
    >
      <circle cx="48" cy="48" r="46" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="48" cy="48" r="29" stroke="currentColor" strokeWidth="1" />
      <defs>
        <path
          id="apparatus-stamp-path"
          d="M 48 10 a 38 38 0 1 1 -0.01 0"
        />
      </defs>
      <text
        fill="currentColor"
        style={{
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          fontSize: "10px",
          letterSpacing: "1.1px",
        }}
      >
        <textPath href="#apparatus-stamp-path" startOffset="0">
          {"DEVFESTDC 2026 · WASHINGTON D.C. ·"}
        </textPath>
      </text>
      <text
        x="48"
        y="48"
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        style={{
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          fontSize: "15px",
        }}
      >
        {"</>"}
      </text>
    </svg>
  );
}
