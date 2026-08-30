import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Colophon } from "@/components/ui/Colophon";
import {
  FolioHeader,
  InstrumentName,
  StateAttr,
} from "@/components/ui/FolioHeader";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { TracerClient } from "./TracerClient";

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

export default function TracerPage() {
  return (
    <div style={container}>
      <FolioHeader
        left={<InstrumentName>Tracer</InstrumentName>}
        right={
          <>
            <MicroLabel>Instrument (N°01)</MicroLabel>
            <StateAttr value="draft" />
          </>
        }
      />

      <TracerClient />

      <Colophon />
    </div>
  );
}
