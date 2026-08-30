"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { OntologyGraph } from "@/components/OntologyGraph";
import { stanceClustersToElements } from "@/lib/engine/graph";
import type { StanceCluster, DepMode } from "@/lib/engine/schemas";
import { ApparatusMargin, MarginSection } from "@/components/ui/ApparatusMargin";
import { LacunaState, CollatingState } from "@/components/ui/LacunaState";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";

/**
 * A GET /api/documents row. Not a SPEC §3 type (no zod schema exists yet —
 * Lane A charter item 4 builds that route) so this stays a minimal, tolerant
 * local shape: any object with a string `id` is treated as a corpus document,
 * everything else is presentation-only. Never widened into schemas.ts.
 */
type CorpusDoc = { id: string; title?: string; sourceUrl?: string };

type CorpusStatus = "loading" | "unavailable" | "empty" | "ready";

type StanceApiResponse =
  | { data: StanceCluster[]; mode: DepMode; fetchedAt?: string }
  | { data: null; lacuna: { dep: string; reason: string } };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function coerceCorpusDocs(json: unknown): CorpusDoc[] {
  const raw = Array.isArray(json)
    ? json
    : isRecord(json) && Array.isArray(json.data)
      ? json.data
      : null;
  if (!raw) return [];
  const out: CorpusDoc[] = [];
  for (const item of raw) {
    if (isRecord(item) && typeof item.id === "string") {
      out.push({
        id: item.id,
        title: typeof item.title === "string" ? item.title : undefined,
        sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : undefined,
      });
    }
  }
  return out;
}

/** HH:MM (UTC) from an ISO timestamp, for the "COLLATED HH:MM" chip. */
function hhmm(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(11, 16);
}

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

const primaryButtonDisabled: CSSProperties = {
  ...primaryButton,
  background: "var(--stock-2)",
  color: "var(--ink-2)",
  cursor: "not-allowed",
};

const corpusList: CSSProperties = {
  border: "1px solid var(--hairline)",
  borderRadius: "var(--radius)",
  maxHeight: "180px",
  overflowY: "auto",
  padding: "var(--space-unit)",
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--space-unit) * 0.5)",
};

const dimMono: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-mono)",
  color: "var(--ink-2)",
  margin: 0,
};

export function MapClient() {
  const [question, setQuestion] = useState("");
  const [corpusStatus, setCorpusStatus] = useState<CorpusStatus>("loading");
  const [documents, setDocuments] = useState<CorpusDoc[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    clusters: StanceCluster[];
    mode: DepMode;
    fetchedAt?: string;
  } | null>(null);
  const [lacuna, setLacuna] = useState<{ dep: string; reason: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/documents")
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return (await res.json()) as unknown;
      })
      .then((json) => {
        if (cancelled) return;
        const docs = coerceCorpusDocs(json);
        setDocuments(docs);
        setCorpusStatus(docs.length > 0 ? "ready" : "empty");
      })
      .catch(() => {
        // GET /api/documents isn't wired yet (Lane A charter item 4) or the
        // corpus is unreachable — this instrument falls back to web search
        // (SPEC §5), never a crash (CLAUDE.md eng rule 5).
        if (!cancelled) setCorpusStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleDoc(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function mapStances() {
    const trimmed = question.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setResult(null);
    setLacuna(null);
    try {
      const res = await fetch("/api/stance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          ...(selectedIds.length > 0 ? { documentIds: selectedIds } : {}),
        }),
      });
      const json = (await res.json()) as StanceApiResponse | { error: string };
      if ("lacuna" in json && json.lacuna) {
        setLacuna(json.lacuna);
      } else if ("data" in json && Array.isArray(json.data)) {
        setResult({
          clusters: json.data,
          mode: "mode" in json ? (json.mode as DepMode) : "fixture",
          fetchedAt: "fetchedAt" in json ? (json.fetchedAt as string) : undefined,
        });
      } else {
        setLacuna({ dep: "route", reason: "the response was not a valid StanceCluster[] answer" });
      }
    } catch (err) {
      setLacuna({
        dep: "route",
        reason: err instanceof Error ? err.message : "the request could not be completed",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const elements = result ? stanceClustersToElements(result.clusters) : [];

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
          <MicroLabel as="label" htmlFor="contested-question" tone="dim">
            Contested question
          </MicroLabel>
          <input
            id="contested-question"
            name="contested-question"
            type="text"
            placeholder="Ask a question the sources disagree about."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            style={questionInput}
          />
        </div>

        <div>
          <MicroLabel tone="dim" as="div" style={{ marginBottom: "var(--space-unit)" }}>
            Corpus sources (optional — falls back to web search)
          </MicroLabel>
          {corpusStatus === "loading" ? (
            <p style={dimMono}>corpus: loading…</p>
          ) : corpusStatus === "unavailable" ? (
            <p style={dimMono}>
              Corpus not yet available in this build — sourcing will fall back to web
              search.
            </p>
          ) : corpusStatus === "empty" ? (
            <p style={dimMono}>
              No documents in the corpus yet — sourcing will fall back to web search.
            </p>
          ) : (
            <div style={corpusList} role="group" aria-label="Corpus documents">
              {documents.map((doc) => (
                <label
                  key={doc.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-unit)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-mono)",
                    color: "var(--ink)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(doc.id)}
                    onChange={() => toggleDoc(doc.id)}
                  />
                  {doc.title ?? doc.sourceUrl ?? doc.id}
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "calc(var(--space-unit) * 3)" }}>
          <button
            type="button"
            onClick={mapStances}
            disabled={!question.trim() || submitting}
            style={question.trim() && !submitting ? primaryButton : primaryButtonDisabled}
          >
            Map stances
          </button>
          {submitting ? <CollatingState /> : null}
        </div>

        <section
          aria-label="Stance graph"
          style={{ marginTop: "calc(var(--space-unit) * 3)" }}
        >
          <MicroLabel
            tone="dim"
            as="h2"
            style={{ display: "block", marginBottom: "calc(var(--space-unit) * 2)" }}
          >
            Stance graph
          </MicroLabel>
          {lacuna ? (
            <div
              style={{
                border: "1px solid var(--hairline)",
                borderRadius: "var(--radius)",
                background: "var(--stock)",
                padding: "calc(var(--space-unit) * 3)",
              }}
            >
              <LacunaState note={lacuna.reason} />
            </div>
          ) : (
            <OntologyGraph
              elements={elements}
              height="420px"
              label={result ? `Stance graph for: ${question}` : "Stance ontology graph"}
            />
          )}
        </section>
      </main>

      <ApparatusMargin>
        <MarginSection label="Cluster inventory">
          {result ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "calc(var(--space-unit) * 1.5)" }}>
              <div>
                <ProvenanceChip mode={result.mode} collatedAt={hhmm(result.fetchedAt)} />
              </div>
              {result.clusters.map((c, i) => (
                <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-unit)" }}>
                    <span
                      aria-hidden
                      style={{
                        display: "inline-block",
                        width: "10px",
                        height: "10px",
                        background: `var(--chart-${Math.min(i, 4) + 1})`,
                        border: "1px solid var(--hairline)",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono)", color: "var(--ink)" }}>
                      {c.label}
                    </span>
                  </div>
                  <p style={{ ...dimMono, paddingLeft: "calc(var(--space-unit) * 2.25)" }}>
                    {c.evidenceKind} · {c.sources.length} source
                    {c.sources.length === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <LacunaState compact />
          )}
        </MarginSection>

        <MarginSection label="Edge types">
          <p style={dimMono}>agrees — solid · disputes — dashed</p>
        </MarginSection>

        <MarginSection label="Limits">
          <p style={dimMono}>5–8 sources per question.</p>
        </MarginSection>
      </ApparatusMargin>
    </div>
  );
}
