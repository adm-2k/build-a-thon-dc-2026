import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Colophon } from "@/components/ui/Colophon";
import {
  FolioHeader,
  InstrumentName,
  StateAttr,
} from "@/components/ui/FolioHeader";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { MapClient } from "./MapClient";

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

      <MapClient />

      <Colophon />
    </div>
  );
}
