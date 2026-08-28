/**
 * Registration mark — DESIGN-BRIEF §6.
 * Small crosshair-in-circle, 12–14px, 1px stroke in --ink-2.
 * Decorative furniture for folio headers and plate corners; aria-hidden.
 */
export function RegMark({ size = 13 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      style={{ color: "var(--ink-2)", flex: "none" }}
    >
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1" />
      <line x1="7" y1="0.5" x2="7" y2="13.5" stroke="currentColor" strokeWidth="1" />
      <line x1="0.5" y1="7" x2="13.5" y2="7" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
