import type { ReactNode } from "react";
import { EventStamp } from "./EventStamp";
import { MicroLabel } from "./MicroLabel";
import { RegMark } from "./RegMark";

/**
 * Colophon — DESIGN-BRIEF §5, §8 ("COLOPHON", never "Footer").
 * Every page ends with one: set-in note · event stamp · reg mark · links.
 */
export function Colophon({
  spin = false,
  children,
}: {
  /** Rotate the event stamp (60s linear; hub/splash moments only). */
  spin?: boolean;
  /** Optional extra lines: attributions, links (tertiary — blue, underlined). */
  children?: ReactNode;
}) {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--hairline)",
        marginTop: "calc(var(--space-unit) * 8)",
        padding: "calc(var(--space-unit) * 4) 0 calc(var(--space-unit) * 6)",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "calc(var(--space-unit) * 4)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "calc(var(--space-unit) * 1.5)",
          minWidth: 0,
        }}
      >
        <MicroLabel tone="dim" as="h2">
          Colophon
        </MicroLabel>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-mono)",
            color: "var(--ink-2)",
            margin: 0,
            maxWidth: "65ch",
          }}
        >
          Set in Archivo, IBM Plex Mono &amp; STIX Two Text · Printed in two
          inks on --stock · Built at DevFestDC 2026, Washington, D.C.
        </p>
        {children ? (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-mono)",
              color: "var(--ink-2)",
            }}
          >
            {children}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "calc(var(--space-unit) * 3)",
        }}
      >
        <RegMark />
        <EventStamp size={64} spin={spin} />
      </div>
    </footer>
  );
}
