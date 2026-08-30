"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { Claim, LogicalForm, SourceVerdict } from "@/lib/engine/schemas";
import {
  ApparatusMargin,
  MarginSection,
} from "@/components/ui/ApparatusMargin";
import { Compartment } from "@/components/ui/Compartment";
import { CollatingState, LacunaState } from "@/components/ui/LacunaState";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import {
  extractClaims,
  formalizeClaim,
  listCorpusDocuments,
  traceClaim,
  type CorpusDocument,
  type DepMode,
} from "./tracer-client";

const CLAIM_CAP = 8; // mirrors app/api/extract/route.ts (SPEC §5)

type ClaimEntry = {
  claim: Claim;
  formalizing: boolean;
  logicalForm?: LogicalForm;
  formalizeError?: string;
  tracing: boolean;
  verdict?: SourceVerdict;
  verdictMode?: DepMode;
  traceError?: string;
};

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

const disabledPrimaryButton: CSSProperties = {
  ...primaryButton,
  background: "var(--ink-2)",
  opacity: 0.5,
  cursor: "not-allowed",
};

const secondaryButton: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontWeight: 500,
  fontSize: "var(--text-label)",
  letterSpacing: "0.06em",
  color: "var(--ink)",
  background: "transparent",
  border: "1px solid var(--ink)",
  borderRadius: "var(--radius-input)",
  padding: "calc(var(--space-unit) * 0.6) calc(var(--space-unit) * 1.25)",
  cursor: "pointer",
};

const errorLine: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-mono)",
  color: "var(--err)",
  margin: 0,
};

const codeBlock: CSSProperties = {
  background: "var(--stock-2)",
  border: "1px solid var(--hairline)",
  borderRadius: "var(--radius)",
  fontFamily: "var(--font-mono)",
  fontSize: "13px",
  lineHeight: 1.7,
  padding: "calc(var(--space-unit) * 1.5)",
  overflowX: "auto",
  color: "var(--ink)",
  margin: 0,
};

const statusColor: Record<SourceVerdict["status"], string> = {
  sourced: "var(--ok)",
  weakly_sourced: "var(--warn)",
  untraceable: "var(--err)",
};

const statusLabel: Record<SourceVerdict["status"], string> = {
  sourced: "Sourced",
  weakly_sourced: "Weakly sourced",
  untraceable: "Untraceable",
};

const operatorLabel: Record<LogicalForm["operator"], string> = {
  asserts: "Asserts",
  obligates: "Obligates",
  permits: "Permits",
  predicts: "Predicts",
};

export function TracerClient() {
  const [sourceText, setSourceText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [entries, setEntries] = useState<ClaimEntry[]>([]);

  const [corpusDocs, setCorpusDocs] = useState<CorpusDocument[] | null>(null);
  const [corpusError, setCorpusError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listCorpusDocuments().then((outcome) => {
      if (cancelled) return;
      if (outcome.ok) {
        setCorpusDocs(outcome.data);
      } else {
        setCorpusError(outcome.reason);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateEntry(claimId: string, patch: Partial<ClaimEntry>) {
    setEntries((prev) =>
      prev.map((e) => (e.claim.id === claimId ? { ...e, ...patch } : e)),
    );
  }

  async function resolveClaim(claim: Claim) {
    void formalizeClaim(claim).then((outcome) => {
      if (outcome.ok) {
        updateEntry(claim.id, { formalizing: false, logicalForm: outcome.data });
      } else {
        updateEntry(claim.id, { formalizing: false, formalizeError: outcome.reason });
      }
    });
    void traceClaim(claim).then((outcome) => {
      if (outcome.ok) {
        updateEntry(claim.id, { tracing: false, verdict: outcome.data, verdictMode: outcome.mode });
      } else {
        updateEntry(claim.id, { tracing: false, traceError: outcome.reason });
      }
    });
  }

  async function onTrace() {
    if (!sourceText.trim()) return; // empty input stays LACUNA, never a spinner
    setExtractError(null);
    setExtracting(true);
    setEntries([]);
    const outcome = await extractClaims(sourceText);
    setExtracting(false);
    if (!outcome.ok) {
      setExtractError(outcome.reason);
      return;
    }
    const fresh: ClaimEntry[] = outcome.data.map((claim) => ({
      claim,
      formalizing: true,
      tracing: true,
    }));
    setEntries(fresh);
    fresh.forEach((e) => void resolveClaim(e.claim));
  }

  function loadCorpusDoc(doc: CorpusDocument) {
    setSourceText(doc.text);
  }

  const sourcedCount = entries.filter((e) => e.verdict?.status === "sourced").length;
  const weakCount = entries.filter((e) => e.verdict?.status === "weakly_sourced").length;
  const untraceableCount = entries.filter((e) => e.verdict?.status === "untraceable").length;
  const verdictsIn = sourcedCount + weakCount + untraceableCount;

  return (
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
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            style={sourceTextarea}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "calc(var(--space-unit) * 2)" }}>
          {extracting ? (
            <CollatingState />
          ) : (
            <button
              type="button"
              style={sourceText.trim() ? primaryButton : disabledPrimaryButton}
              onClick={() => void onTrace()}
            >
              Trace claims
            </button>
          )}
        </div>
        {extractError ? <p style={errorLine}>{extractError}</p> : null}

        <section aria-label="Claims" style={{ marginTop: "calc(var(--space-unit) * 3)" }}>
          <MicroLabel
            tone="dim"
            as="h2"
            style={{ display: "block", marginBottom: "calc(var(--space-unit) * 2)" }}
          >
            Claims
          </MicroLabel>
          {entries.length === 0 ? (
            <Compartment>
              <LacunaState note="Paste a source text and trace its claims to open the record." />
            </Compartment>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "calc(var(--space-unit) * 2)" }}>
              {entries.map((entry) => (
                <ClaimCard key={entry.claim.id} entry={entry} />
              ))}
            </div>
          )}
        </section>
      </main>

      <ApparatusMargin>
        <MarginSection label="Verdicts">
          {verdictsIn === 0 ? (
            <LacunaState compact />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "calc(var(--space-unit) * 0.75)" }}>
              <VerdictTally color={statusColor.sourced} label="Sourced" count={sourcedCount} />
              <VerdictTally color={statusColor.weakly_sourced} label="Weakly sourced" count={weakCount} />
              <VerdictTally color={statusColor.untraceable} label="Untraceable" count={untraceableCount} />
            </div>
          )}
        </MarginSection>

        <MarginSection label="Corpus">
          {corpusDocs && corpusDocs.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "calc(var(--space-unit) * 0.75)" }}>
              {corpusDocs.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  style={{ ...secondaryButton, textAlign: "left" }}
                  onClick={() => loadCorpusDoc(doc)}
                >
                  {doc.title}
                </button>
              ))}
            </div>
          ) : (
            <LacunaState
              compact
              note={corpusError ?? "No corpus documents yet — transcribe a page in Scriptorium, or paste text directly."}
            />
          )}
        </MarginSection>

        <MarginSection label="Provenance key">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-unit)" }}>
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
            Cap: {CLAIM_CAP} claims per document.
          </p>
        </MarginSection>
      </ApparatusMargin>
    </div>
  );
}

function VerdictTally({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <p style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono)", color: "var(--ink-2)", margin: 0 }}>
      <span style={{ color, fontWeight: 500 }}>{count}</span> {label}
    </p>
  );
}

function ClaimCard({ entry }: { entry: ClaimEntry }) {
  const { claim, formalizing, logicalForm, formalizeError, tracing, verdict, verdictMode, traceError } = entry;
  return (
    <Compartment>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-unit)", alignItems: "center", marginBottom: "var(--space-unit)" }}>
        <MicroLabel tone="dim">{claim.kind}</MicroLabel>
        <MicroLabel tone="dim">confidence {claim.confidence.toFixed(2)}</MicroLabel>
      </div>
      <p style={{ fontFamily: "var(--font-arch)", fontSize: "var(--text-ui)", color: "var(--ink)", margin: 0 }}>
        {claim.text}
      </p>

      <div style={{ marginTop: "calc(var(--space-unit) * 2)", borderTop: "1px solid var(--hairline)", paddingTop: "var(--space-unit)" }}>
        <MicroLabel tone="dim" style={{ display: "block", marginBottom: "calc(var(--space-unit) * 0.75)" }}>
          Logical form
        </MicroLabel>
        {formalizing ? (
          <CollatingState />
        ) : formalizeError ? (
          <p style={errorLine}>{formalizeError}</p>
        ) : logicalForm ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "calc(var(--space-unit) * 0.75)" }}>
            <MicroLabel tone="dim">{operatorLabel[logicalForm.operator]}</MicroLabel>
            {logicalForm.premises.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "1.25em", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono)", color: "var(--ink)" }}>
                {logicalForm.premises.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            ) : null}
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono)", color: "var(--ink)", margin: 0 }}>
              → {logicalForm.conclusion}
            </p>
            <pre style={codeBlock}>{logicalForm.formalization}</pre>
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: "calc(var(--space-unit) * 2)", borderTop: "1px solid var(--hairline)", paddingTop: "var(--space-unit)" }}>
        <MicroLabel tone="dim" style={{ display: "block", marginBottom: "calc(var(--space-unit) * 0.75)" }}>
          Verdict
        </MicroLabel>
        {tracing ? (
          <CollatingState />
        ) : traceError ? (
          <p style={errorLine}>{traceError}</p>
        ) : verdict ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "calc(var(--space-unit) * 0.75)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-unit)" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                  fontSize: "var(--text-label)",
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                  color: statusColor[verdict.status],
                }}
              >
                {statusLabel[verdict.status]}
              </span>
              {verdictMode ? <ProvenanceChip mode={verdictMode} /> : null}
            </div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono)", color: "var(--ink-2)", margin: 0 }}>
              {verdict.rationale}
            </p>
            {verdict.sources.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "1.25em", display: "flex", flexDirection: "column", gap: "calc(var(--space-unit) * 0.5)" }}>
                {verdict.sources.map((s, i) => (
                  <li key={i} style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono)" }}>
                    <a href={s.url} style={{ color: "var(--blue)", textDecoration: "underline" }} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>{" "}
                    <ProvenanceChip mode={s.fetchedVia} />
                    {s.quoteSpan ? (
                      <span style={{ display: "block", fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--ink-2)" }}>
                        &ldquo;{s.quoteSpan}&rdquo;
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <LacunaState compact note="No sources were consulted for this claim." />
            )}
          </div>
        ) : null}
      </div>
    </Compartment>
  );
}
