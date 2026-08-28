import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { OntologyGraph } from "@/components/OntologyGraph";
import {
  ApparatusMargin,
  MarginSection,
} from "@/components/ui/ApparatusMargin";
import { Colophon } from "@/components/ui/Colophon";
import {
  FolioHeader,
  InstrumentName,
  StateAttr,
} from "@/components/ui/FolioHeader";
import { LacunaState } from "@/components/ui/LacunaState";
import { MicroLabel } from "@/components/ui/MicroLabel";

export const metadata: Metadata = {
  title: "Map — Instrument (N°02) · Apparatus",
  description:
    "A contested question; 5–8 sources clustered by stance into a typed disagreement graph.",
};

const container: CSSProperties = {
  maxWidth: "var(--page-max)",
  margin: "0 auto",
  padding: "0 calc(var(--space-unit) * 3)",
};

const questionInput: CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: "65ch",
  marginTop: "var(--space-unit)",
  fontFamily: "var(--font-arch)",
  fontSize: "var(--text-body)",
  color: "var(--ink)",
  background: "var(--stock)",
  border: "1px solid var(--hairline)",
  borderRadius: "var(--radius-input)",
  padding: "calc(var(--space-unit) * 1.5)",
};

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

export default function MapPage() {
  return (
    <div style={container}>
      <FolioHeader
        left={<InstrumentName>Map</InstrumentName>}
        right={
          <>
            <MicroLabel>Instrument (N°02)</MicroLabel>
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
            <MicroLabel as="label" htmlFor="contested-question" tone="dim">
              Contested question
            </MicroLabel>
            <input
              id="contested-question"
              name="contested-question"
              type="text"
              placeholder="Ask a question the sources disagree about."
              style={questionInput}
            />
          </div>

          <div>
            <button type="button" style={primaryButton}>
              Map stances
            </button>
          </div>

          <section
            aria-label="Stance graph"
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
              Stance graph
            </MicroLabel>
            <OntologyGraph elements={[]} height="420px" />
          </section>
        </main>

        <ApparatusMargin>
          <MarginSection label="Cluster inventory">
            <LacunaState compact />
          </MarginSection>

          <MarginSection label="Edge types">
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-mono)",
                color: "var(--ink-2)",
                margin: 0,
              }}
            >
              agrees — solid · disputes — dashed
            </p>
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
              5–8 sources per question.
            </p>
          </MarginSection>
        </ApparatusMargin>
      </div>

      <Colophon />
    </div>
  );
}
