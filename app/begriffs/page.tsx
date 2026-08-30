import type { Metadata } from "next";
import { BegriffsClient } from "./BegriffsClient";

export const metadata: Metadata = {
  title: "Begriffs — Instrument (N°03) · Apparatus",
  description:
    "A term; its etymology chain and how often it appears, century by century, plus decade resolution 1890–1950.",
};

export default function BegriffsPage() {
  return <BegriffsClient />;
}
