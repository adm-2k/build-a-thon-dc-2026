"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ApparatusMargin,
  MarginSection,
} from "@/components/ui/ApparatusMargin";
import { Colophon } from "@/components/ui/Colophon";
import { Compartment } from "@/components/ui/Compartment";
import { FolioHeader, InstrumentName } from "@/components/ui/FolioHeader";
import { CollatingState, LacunaState } from "@/components/ui/LacunaState";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import {
  DepModeSchema,
  TermSnapshotSchema,
  type DepMode,
  type TermSnapshot,
} from "@/lib/engine/schemas";
import styles from "./begriffs.module.css";
import { SEED_TERMS, fixtureSnapshotsFor, type SeedTerm } from "./terms-data";

type Resolution = "century" | "decade";

/**
 * Attempt the live engine route first (Lane A charter item 8, T4 — the
 * route does not exist on origin/main yet, so this always resolves null
 * today). The moment it ships, this takes priority with zero client change.
 */
async function fetchLiveTerm(
  term: string,
  signal: AbortSignal,
): Promise<{ rows: TermSnapshot[]; mode: DepMode } | null> {
  try {
    const res = await fetch(`/api/terms?term=${encodeURIComponent(term)}`, {
      signal,
    });
    if (!res.ok) return null;
    const body: unknown = await res.json().catch(() => null);
    if (!body || typeof body !== "object") return null;
    const raw = "data" in body ? (body as { data: unknown }).data : body;
    if (!Array.isArray(raw)) return null;
    const rows: TermSnapshot[] = [];
    for (const row of raw) {
      const parsed = TermSnapshotSchema.safeParse(row);
      if (parsed.success) rows.push(parsed.data);
    }
    if (rows.length === 0) return null;
    const modeParsed = DepModeSchema.safeParse(
      (body as Record<string, unknown>).mode,
    );
    return { rows, mode: modeParsed.success ? modeParsed.data : "live" };
  } catch {
    return null;
  }
}

function isSeedTerm(value: string): value is SeedTerm {
  return (SEED_TERMS as readonly string[]).includes(value);
}

/**
 * Begriffs — Instrument (N°03), SPEC v2 §0/§5: term → etymology chain +
 * frequency panel, EN/DE, century intervals plus decade resolution
 * 1890–1950. Full anatomy: folio header, apparatus margin, colophon.
 */
export function BegriffsClient() {
  const [term, setTerm] = useState<SeedTerm>(SEED_TERMS[0]);
  const [resolution, setResolution] = useState<Resolution>("century");
  const [live, setLive] = useState<
    { rows: TermSnapshot[]; mode: DepMode } | null | "loading"
  >("loading");

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLive("loading");
    fetchLiveTerm(term, controller.signal).then((result) => {
      if (!cancelled) setLive(result);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [term]);

  const fallbackRows = useMemo(() => fixtureSnapshotsFor(term), [term]);

  const isLoading = live === "loading";
  const rows: TermSnapshot[] = isLoading ? [] : (live?.rows ?? fallbackRows);
  const mode: DepMode = !isLoading && live ? live.mode : "cached";

  const freqRows = useMemo(
    () =>
      rows
        .filter((r) => r.relFreq != null)
        .filter((r) =>
          resolution === "century"
            ? r.yearBucket % 100 === 0 &&
              r.yearBucket >= 1500 &&
              r.yearBucket <= 1900
            : r.yearBucket >= 1890 && r.yearBucket <= 1950,
        )
        .sort((a, b) => a.yearBucket - b.yearBucket),
    [rows, resolution],
  );

  const senses = useMemo(
    () => rows.flatMap((r) => r.senses),
    [rows],
  );

  const maxFreq = Math.max(0, ...freqRows.map((r) => r.relFreq ?? 0));
  const hasAnyData = !isLoading && rows.length > 0;

  return (
    <div
      style={{ maxWidth: "var(--page-max)", margin: "0 auto", padding: "0 calc(var(--space-unit) * 3)" }}
    >
      <FolioHeader
        left={<InstrumentName>Begriffs</InstrumentName>}
        right={<MicroLabel>Instrument (N°03)</MicroLabel>}
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
            gap: "calc(var(--space-unit) * 4)",
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
              A term; its etymology chain and how often it appears, century
              by century.
            </p>
          </div>

          <div className={styles.picker} role="group" aria-label="Term">
            {SEED_TERMS.map((t) => (
              <button
                key={t}
                type="button"
                className={styles.pickerButton}
                aria-pressed={t === term}
                onClick={() => isSeedTerm(t) && setTerm(t)}
              >
                {t}
              </button>
            ))}
          </div>

          <Compartment
            label="Frequency panel"
            style={{ display: "flex", flexDirection: "column", gap: "calc(var(--space-unit) * 3)" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "calc(var(--space-unit) * 2)",
              }}
            >
              <ProvenanceChip mode={isLoading ? "cached" : mode} />
              <div className={styles.toggle} role="group" aria-label="Sampling resolution">
                <button
                  type="button"
                  className={styles.toggleButton}
                  aria-pressed={resolution === "century"}
                  onClick={() => setResolution("century")}
                >
                  Century
                </button>
                <button
                  type="button"
                  className={styles.toggleButton}
                  aria-pressed={resolution === "decade"}
                  onClick={() => setResolution("decade")}
                >
                  Decade 1890–1950
                </button>
              </div>
            </div>

            {isLoading ? (
              <CollatingState />
            ) : freqRows.length === 0 ? (
              <LacunaState
                compact
                note="No frequency rows harvested for this term at this resolution yet."
              />
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "calc(var(--space-unit) * 1)" }}>
                  {freqRows.map((r) => {
                    const value = r.relFreq ?? 0;
                    const pct = maxFreq > 0 ? (value / maxFreq) * 100 : 0;
                    return (
                      <div className={styles.chartRow} key={r.yearBucket}>
                        <span className={styles.chartLabel}>{r.yearBucket}</span>
                        <div className={styles.chartTrack}>
                          <div
                            className={styles.chartFill}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className={styles.chartValue}>
                          {value.toExponential(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <table className={styles.table}>
                  <caption
                    style={{
                      textAlign: "left",
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-label)",
                      letterSpacing: "0.09em",
                      textTransform: "uppercase",
                      color: "var(--ink-2)",
                      marginBottom: "var(--space-unit)",
                    }}
                  >
                    Table view
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Year</th>
                      <th scope="col" className={styles.num}>
                        Relative frequency
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {freqRows.map((r) => (
                      <tr key={r.yearBucket}>
                        <td>{r.yearBucket}</td>
                        <td className={styles.num}>
                          {(r.relFreq ?? 0).toExponential(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-mono)",
                color: "var(--ink-2)",
                margin: 0,
                maxWidth: "65ch",
              }}
            >
              Frequency curves from Google Books n-grams, sampled at century
              intervals; OCR noise and corpus composition bias early
              centuries; finer-grained sampling is future work.
            </p>
          </Compartment>

          <Compartment
            label="Etymology chain"
            style={{ display: "flex", flexDirection: "column", gap: "calc(var(--space-unit) * 2)" }}
          >
            {isLoading ? (
              <CollatingState />
            ) : !hasAnyData ? (
              <LacunaState compact />
            ) : senses.length === 0 ? (
              <LacunaState
                compact
                note="Wiktionary itself has no Herkunft (etymology) section for this term — a verified content gap, not a fetch failure."
              />
            ) : (
              <div>
                {senses.map((sense, i) => (
                  <div className={styles.senseItem} key={i}>
                    <p className={styles.senseGloss}>{sense.gloss}</p>
                    {sense.firstAttested ? (
                      <span className={styles.senseMeta}>
                        {sense.firstAttested}
                      </span>
                    ) : null}
                    <p className={styles.senseNote}>{sense.note}</p>
                  </div>
                ))}
              </div>
            )}
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
              {SEED_TERMS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </MarginSection>

          <MarginSection label="Sampling">
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-mono)",
                color: "var(--ink-2)",
                margin: 0,
              }}
            >
              Century buckets 1500–1900, plus decades 1890–1950.
            </p>
          </MarginSection>
        </ApparatusMargin>
      </div>

      <Colophon>
        <p style={{ margin: 0 }}>
          Frequency curves from Google Books n-grams, sampled at century
          intervals; OCR noise and corpus composition bias early centuries;
          finer-grained sampling is future work. Etymologies from Wiktionary
          · CC BY-SA 4.0.
        </p>
      </Colophon>
    </div>
  );
}
