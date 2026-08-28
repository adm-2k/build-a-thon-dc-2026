import type { Metadata } from "next";
import type { CSSProperties } from "react";
import {
  ApparatusMargin,
  MarginSection,
} from "@/components/ui/ApparatusMargin";
import { Colophon } from "@/components/ui/Colophon";
import { Compartment } from "@/components/ui/Compartment";
import {
  FolioHeader,
  InstrumentName,
  StateAttr,
} from "@/components/ui/FolioHeader";
import { LacunaState } from "@/components/ui/LacunaState";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";

export const metadata: Metadata = {
  title: "Tracer — Instrument (N°01) · Apparatus",
  description:
    "Paste a text; its atomic claims are collated, given their logical form, and traced to sources.",
};

const container: CSSProperties = {
  maxWidth: "var(--page-max)",
  margin: "0 auto",
  padding: "0 calc(var(--space-unit) * 3)",
};

/* Input spec — DESIGN-BRIEF §6. Source text wears the Manuscript voice. */
const sourceTextarea: CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: "65ch",
  marginTop: "var(--space-unit)",
  fontFamily: "var(--font-serif)",
  fontSize: "var(--text-read)",
  lineHeight: 1.65,
  color: "var(--ink)",
  background: "var(--stock)",
  border: "1px solid var(--hairline)",
  borderRadius: "var(--radius-input)",
  padding: "calc(var(--space-unit) * 1.5)",
  resize: "vertical",
};

/* Primary button — one per view; it is an instruction, hence rubricated. */
const primaryButton: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontWeight: 500,
  fontSize: "var(--text-mono)",
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  color: "var(--on-rubric)",
  background: "var(--rubric)",
  border: "none",
  borderRadius: "var(--radius-input)",
  padding: "calc(var(--space-unit) * 1.25) calc(var(--space-unit) * 2.5)",
  cursor: "pointer",
};

export default function TracerPage() {
  return (
    <div style={container}>
      <FolioHeader
        left={<InstrumentName>Tracer</InstrumentName>}
        right={
          <>
            <MicroLabel>Instrument (N°01)</MicroLabel>
            <StateAttr value="draft" />
            <MicroLabel tone="dim">2026-08-28</MicroLabel>
          </>
        }
      />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "calc(var(--space-unit) * 4)",
          paddingTop: "calc(var(--space-unit) * 4)",
        }}
      >
        <main
          style={{
            flex: "1 1 480px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "calc(var(--space-unit) * 3)",
          }}
        >
          <div>
            <MicroLabel as="label" htmlFor="source-text" tone="dim">
              Source text
            </MicroLabel>
            <textarea
              id="source-text"
              name="source-text"
              rows={8}
              placeholder="Paste the text whose claims you want traced."
              style={sourceTextarea}
            />
          </div>

          <div>
            <button type="button" style={primaryButton}>
              Trace claims
            </button>
          </div>

          <section
            aria-label="Claims"
            style={{ marginTop: "calc(var(--space-unit) * 3)" }}
          >
            <MicroLabel
              tone="dim"
              as="h2"
              style={{
                display: "block",
                marginBottom: "calc(var(--space-unit) * 2)",
              }}
            >
              Claims
            </MicroLabel>
            <Compartment>
              <LacunaState note="Paste a source text and trace its claims to open the record." />
            </Compartment>
          </section>
        </main>

        <ApparatusMargin>
          <MarginSection label="Verdicts">
            <LacunaState compact />
          </MarginSection>

          <MarginSection label="Provenance key">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-unit)",
              }}
            >
              <ProvenanceChip mode="live" />
              <ProvenanceChip mode="cached" collatedAt="HH:MM" />
              <ProvenanceChip mode="fixture" />
            </div>
          </MarginSection>

          <MarginSection label="Limits">
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-mono)",
                color: "var(--ink-2)",
                margin: 0,
              }}
            >
              Cap: 8 claims per document.
            </p>
          </MarginSection>
        </ApparatusMargin>
      </div>

      <Colophon />
    </div>
  );
}
