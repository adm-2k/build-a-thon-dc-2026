import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Colophon } from "@/components/ui/Colophon";
import {
  FolioHeader,
  InstrumentName,
  StateAttr,
} from "@/components/ui/FolioHeader";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { NetworkClient } from "./NetworkClient";

export const metadata: Metadata = {
  title: "Prosopon — Instrument (N°04) · Apparatus",
  description:
    "Named entities recognized across the corpus, charted as a typed co-occurrence network.",
};

const container: CSSProperties = {
  maxWidth: "var(--page-max)",
  margin: "0 auto",
  padding: "0 calc(var(--space-unit) * 3)",
};

export default function NetworkPage() {
  return (
    <div style={container}>
      <FolioHeader
        left={<InstrumentName>Prosopon</InstrumentName>}
        right={
          <>
            <MicroLabel>Instrument (N°04)</MicroLabel>
            <StateAttr value="draft" />
            <MicroLabel tone="dim">2026-08-30</MicroLabel>
          </>
        }
      />

      <NetworkClient />

      <Colophon />
    </div>
  );
}
