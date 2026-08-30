import type { Metadata } from "next";
import Link from "next/link";
import { Colophon } from "@/components/ui/Colophon";
import { FolioHeader, InstrumentName, StateAttr } from "@/components/ui/FolioHeader";

export const metadata: Metadata = {
  title: "Folio missing · Apparatus",
  description: "The requested page has no leaf in the record.",
};

/**
 * FOLIO MISSING — DESIGN-BRIEF §8 lexicon, verbatim (never "404").
 * Full anatomy per CLAUDE.md rule 3: folio header + colophon even here.
 */
export default function NotFound() {
  return (
    <div
      style={{
        maxWidth: "var(--page-max)",
        margin: "0 auto",
        padding: "0 calc(var(--space-unit) * 3)",
      }}
    >
      <FolioHeader
        left={<InstrumentName>Apparatus</InstrumentName>}
        right={<StateAttr value="missing" />}
      />

      <main
        style={{
          padding: "calc(var(--space-unit) * 12) 0",
          display: "flex",
          flexDirection: "column",
          gap: "calc(var(--space-unit) * 3)",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-arch)",
            fontWeight: 600,
            fontSize: "var(--display-2)",
            letterSpacing: "-0.02em",
            lineHeight: 1.08,
            textWrap: "balance",
            color: "var(--ink)",
            margin: 0,
          }}
        >
          FOLIO{" "}
          <span
            style={{
              color: "var(--rubric)",
              textShadow: "0.045em 0.045em 0 var(--misreg)",
            }}
          >
            MISSING
          </span>
        </h1>
        <p
          style={{
            fontFamily: "var(--font-arch)",
            fontSize: "var(--text-lead)",
            color: "var(--ink-2)",
            margin: 0,
            maxWidth: "50ch",
          }}
        >
          There is no leaf in the record at this address.
        </p>
        <p style={{ margin: 0 }}>
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-arch)",
              fontSize: "var(--text-ui)",
              color: "var(--blue)",
              textDecoration: "underline",
            }}
          >
            Return to the catalogue
          </Link>
        </p>
      </main>

      <Colophon />
    </div>
  );
}
