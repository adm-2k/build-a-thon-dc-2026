import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Colophon } from "@/components/ui/Colophon";
import { FolioHeader, InstrumentName, StateAttr } from "@/components/ui/FolioHeader";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { ScriptoriumClient } from "./ScriptoriumClient";

export const metadata: Metadata = {
  title: "Scriptorium — Instrument (N°00) · Apparatus",
  description:
    "Page image in, transcription out: a hot-swappable vision model reads the scan and the record is fixed to the corpus.",
};

const container: CSSProperties = {
  maxWidth: "var(--page-max)",
  margin: "0 auto",
  padding: "0 calc(var(--space-unit) * 3)",
};

export default function ScriptoriumPage() {
  return (
    <div style={container}>
      <FolioHeader
        left={<InstrumentName>Scriptorium</InstrumentName>}
        right={
          <>
            <MicroLabel>Instrument (N°00)</MicroLabel>
            <StateAttr value="draft" />
          </>
        }
      />

      <ScriptoriumClient />

      <Colophon />
    </div>
  );
}
