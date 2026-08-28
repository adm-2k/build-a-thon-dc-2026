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
} from "@/components/ui/FolioHeader";
import { LacunaState } from "@/components/ui/LacunaState";
import { MicroLabel } from "@/components/ui/MicroLabel";

export const metadata: Metadata = {
  title: "Begriffs — Instrument (N°03) · Apparatus",
  description:
    "A term; its etymology chain and a century-interval frequency panel. Stretch instrument.",
};

const container: CSSProperties = {
  maxWidth: "var(--page-max)",
  margin: "0 auto",
  padding: "0 calc(var(--space-unit) * 3)",
};

const monoNote: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-mono)",
  color: "var(--ink-2)",
  margin: 0,
  maxWidth: "65ch",
};

const seedTerms = [
  "Erfahrung",
  "Fordismus",
  "Rationalisierung",
  "experience",
  "rationalization",
];

export default function BegriffsPage() {
  return (
    <div style={container}>
      <FolioHeader
        left={<InstrumentName>Begriffs</InstrumentName>}
        right={
          <>
            <MicroLabel>Instrument (N°03)</MicroLabel>
            <MicroLabel tone="dim">Stretch</MicroLabel>
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
            <p
              style={{
                fontFamily: "var(--font-arch)",
                fontSize: "var(--text-lead)",
                color: "var(--ink)",
                margin: 0,
                maxWidth: "65ch",
              }}
            >
              A term; its etymology chain and how often it appears, century by
              century.
            </p>
            <p style={{ ...monoNote, marginTop: "var(--space-unit)" }}>
              LACUNA — future work.
            </p>
          </div>

          <Compartment label="Frequency panel" style={{ opacity: 0.6 }}>
            <LacunaState compact />
            <p style={{ ...monoNote, marginTop: "calc(var(--space-unit) * 2)" }}>
              Frequency curves from Google Books n-grams, sampled at century
              intervals; OCR noise and corpus composition bias early centuries;
              finer-grained sampling is future work.
            </p>
          </Compartment>

          <Compartment label="Etymology chain" style={{ opacity: 0.6 }}>
            <LacunaState compact />
          </Compartment>
        </main>

        <ApparatusMargin>
          <MarginSection label="Seed terms">
            <ul
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-mono)",
                color: "var(--ink-2)",
                margin: 0,
                paddingLeft: "calc(var(--space-unit) * 2)",
                display: "flex",
                flexDirection: "column",
                gap: "calc(var(--space-unit) * 0.5)",
              }}
            >
              {seedTerms.map((term) => (
                <li key={term}>{term}</li>
              ))}
            </ul>
          </MarginSection>

          <MarginSection label="Sampling">
            <p style={monoNote}>
              Century buckets 1500–1900, plus 1950 and 2000.
            </p>
          </MarginSection>
        </ApparatusMargin>
      </div>

      <Colophon>
        <p style={{ margin: 0 }}>
          Etymologies from Wiktionary · CC BY-SA 4.0 · Frequency data from
          Google Books n-grams.
        </p>
      </Colophon>
    </div>
  );
}
