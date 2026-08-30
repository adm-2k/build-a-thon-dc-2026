"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CollatingState, LacunaState } from "@/components/ui/LacunaState";
import { Colophon } from "@/components/ui/Colophon";
import { FolioHeader } from "@/components/ui/FolioHeader";
import { InstrumentNumber, MicroLabel } from "@/components/ui/MicroLabel";
import { Ticker, type TickerItem } from "@/components/ui/Ticker";
import type { TickerEvent } from "@/lib/engine/schemas";
import styles from "./page.module.css";

/** Hub polling cadence — SPEC v2 §5 "Ticker: unchanged (polling, ruling T1)". */
const POLL_MS = 5000;

/** The wordmark — the name set as a self-closing XML element (§2). */
function Wordmark() {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        fontSize: "var(--text-lead)",
        letterSpacing: "-0.02em",
        color: "var(--ink)",
        whiteSpace: "nowrap",
      }}
    >
      {"<apparatus"}
      <span style={{ color: "var(--rubric)" }}>{"/"}</span>
      {">"}
    </span>
  );
}

/** The five instruments — SPEC v2 §0 table, verbatim order (ruling T11: five cells). */
const INSTRUMENTS: {
  n: TickerEvent["instrument"];
  name: string;
  href: string;
  function: string;
}[] = [
  {
    n: "00",
    name: "Scriptorium",
    href: "/scriptorium",
    function:
      "A page image; transcribed by a hot-swappable vision model and fixed in the corpus.",
  },
  {
    n: "01",
    name: "Tracer",
    href: "/tracer",
    function:
      "A text; its atomic claims are collated, given their logical form, and traced to sources.",
  },
  {
    n: "02",
    name: "Map",
    href: "/map",
    function:
      "A contested question; sources clustered by stance into a typed disagreement graph.",
  },
  {
    n: "03",
    name: "Begriffs",
    href: "/begriffs",
    function:
      "A term; its etymology chain and how often it appears, century by century.",
  },
  {
    n: "04",
    name: "Prosopon",
    href: "/network",
    function:
      "The corpus's named entities, charted as a typed co-occurrence network.",
  },
];

/**
 * Fetch the latest TickerEvent[] from the corpus-wide events feed.
 * Returns null on any failure — the caller treats null as "keep waiting",
 * never as an empty result (an unreachable feed is a state, not a crash).
 */
async function fetchEvents(signal: AbortSignal): Promise<TickerEvent[] | null> {
  try {
    const res = await fetch("/api/events", { signal });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const rows =
      body && typeof body === "object" && "data" in body
        ? (body as { data: unknown }).data
        : body;
    return Array.isArray(rows) ? (rows as TickerEvent[]) : null;
  } catch {
    return null;
  }
}

/**
 * The hub — DESIGN-BRIEF §10, the catalogue.
 * Ticker (polling) → folio header → thesis → five catalogue cells with live
 * counts → colophon. A single client island so the ticker and the per-cell
 * live counts share one poll; everything else is static.
 */
export function HubClient() {
  const [events, setEvents] = useState<TickerEvent[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function poll() {
      const rows = await fetchEvents(controller.signal);
      if (!cancelled && rows !== null) setEvents(rows);
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
  }, []);

  const tickerItems: TickerItem[] = events ?? [];

  return (
    <>
      <Ticker events={tickerItems} />
      <div className={styles.container}>
        <FolioHeader
          left={<Wordmark />}
          right={
            <>
              <MicroLabel tone="dim">The catalogue</MicroLabel>
            </>
          }
        />

        <main>
          <section
            style={{
              padding:
                "calc(var(--space-unit) * 8) 0 calc(var(--space-unit) * 8)",
            }}
          >
            <h1 className={styles.thesis}>
              Markup and manuscript,{" "}
              <span className={styles.rubricated}>printed in register</span>.
            </h1>
            <p className={styles.lead}>Instruments for reading closely.</p>
          </section>

          <section aria-labelledby="catalogue-heading">
            <MicroLabel
              tone="dim"
              as="h2"
              style={{
                display: "block",
                marginBottom: "calc(var(--space-unit) * 2)",
              }}
            >
              <span id="catalogue-heading">Catalogue</span>
            </MicroLabel>

            <div className={styles.grid}>
              {INSTRUMENTS.map((inst) => {
                const event = events?.find((e) => e.instrument === inst.n);
                return (
                  <Link key={inst.n} href={inst.href} className={styles.cell}>
                    <div className={styles.cellTop}>
                      <InstrumentNumber n={inst.n} />
                      <span className={styles.arrow} aria-hidden="true">
                        {"→"}
                      </span>
                    </div>
                    <p className={styles.name}>{inst.name}</p>
                    <p className={styles.function}>{inst.function}</p>
                    {events === null ? (
                      <CollatingState />
                    ) : event ? (
                      <p className={styles.status}>
                        {event.count != null
                          ? `${event.count} ${event.verb}`
                          : event.verb}
                      </p>
                    ) : (
                      <LacunaState compact />
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        </main>

        <Colophon spin />
      </div>
    </>
  );
}
