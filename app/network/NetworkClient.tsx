"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { OntologyGraph } from "@/components/OntologyGraph";
import { entitiesToElements, ENTITY_KIND_ORDER } from "@/lib/engine/graph";
import {
  DocumentSchema,
  EntitySchema,
  type DepMode,
  type Document,
  type Entity,
} from "@/lib/engine/schemas";
import { ApparatusMargin, MarginSection } from "@/components/ui/ApparatusMargin";
import { LacunaState, CollatingState } from "@/components/ui/LacunaState";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";

type CorpusStatus = "loading" | "unavailable" | "empty" | "ready";

type DocChartStatus =
  | { title: string; ok: true; mode: DepMode; fetchedAt?: string; count: number }
  | { title: string; ok: false; reason: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** unknown (GET /api/documents response `data`) -> Document[], zod-parsed against schemas.ts. */
function coerceDocuments(json: unknown): Document[] {
  const raw = Array.isArray(json)
    ? json
    : isRecord(json) && Array.isArray(json.data)
      ? json.data
      : null;
  if (!raw) return [];
  const out: Document[] = [];
  for (const item of raw) {
    const parsed = DocumentSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * Document (SPEC §3) has no `title` — live-verified once GET /api/documents
 * landed (#17): it carries `text`, `sourceUrl`, `tool`, `createdAt`. A raw
 * sourceUrl for a Scriptorium page is "scriptorium:<sha>" (SPEC §3b) —
 * meaningless in the "Sources charted" margin — so prefer a text snippet.
 */
function labelFor(doc: Document): string {
  if (doc.text && doc.text.trim()) {
    const oneLine = doc.text.replace(/\s+/g, " ").trim();
    return oneLine.length > 72 ? `${oneLine.slice(0, 71)}…` : oneLine;
  }
  return doc.sourceUrl ?? doc.id;
}

/**
 * unknown (POST /api/ner response `data`) -> Entity[], zod-parsed against
 * the real schemas.ts EntitySchema (CLAUDE.md eng rule 1 — no more local
 * duck-typing now that schemas v2 has landed). id/documentId are stamped
 * from the request before parsing in case a fixture/route omits either;
 * a row that still fails validation is dropped, never widened.
 */
function coerceEntities(data: unknown, documentId: string): Entity[] {
  if (!Array.isArray(data)) return [];
  const out: Entity[] = [];
  for (const item of data) {
    if (!isRecord(item) || typeof item.name !== "string") continue;
    const stamped = {
      ...item,
      id: typeof item.id === "string" && item.id.length > 0 ? item.id : `${documentId}:${item.name}`,
      documentId: typeof item.documentId === "string" ? item.documentId : documentId,
    };
    const parsed = EntitySchema.safeParse(stamped);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function hhmm(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(11, 16);
}

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

const dimMono: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-mono)",
  color: "var(--ink-2)",
  margin: 0,
};

const monoLink: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-mono)",
  color: "var(--blue)",
  textDecoration: "underline",
};

const KIND_LABEL: Record<Entity["kind"], string> = {
  person: "Person",
  place: "Place",
  org: "Org",
  work: "Work",
  concept: "Concept",
};

export function NetworkClient() {
  const [corpusStatus, setCorpusStatus] = useState<CorpusStatus>("loading");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [charting, setCharting] = useState(false);
  const [hasCharted, setHasCharted] = useState(false);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [docStatus, setDocStatus] = useState<Map<string, DocChartStatus>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/documents")
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return (await res.json()) as unknown;
      })
      .then((json) => {
        if (cancelled) return;
        const docs = coerceDocuments(json);
        setDocuments(docs);
        setCorpusStatus(docs.length > 0 ? "ready" : "empty");
      })
      .catch(() => {
        // GET /api/documents is wired (#17) but network/server failure is
        // still possible — an unreachable corpus gets the same
        // LACUNA-pointing-at-Scriptorium state as a genuinely empty one,
        // never a crash (CLAUDE.md eng rule 5).
        if (!cancelled) setCorpusStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function chartCorpus() {
    if (charting || documents.length === 0) return;
    setCharting(true);
    setHasCharted(true);

    const results = await Promise.all(
      documents.map(async (doc) => {
        const title = labelFor(doc);
        try {
          const res = await fetch("/api/ner", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documentId: doc.id }),
          });
          const json = (await res.json()) as unknown;
          if (isRecord(json) && isRecord(json.lacuna)) {
            const reason =
              typeof json.lacuna.reason === "string" ? json.lacuna.reason : "no entities returned";
            return { docId: doc.id, title, ok: false as const, reason };
          }
          if (isRecord(json) && Array.isArray(json.data)) {
            const ents = coerceEntities(json.data, doc.id);
            const mode: DepMode = json.mode === "live" || json.mode === "cached" ? json.mode : "fixture";
            const fetchedAt = typeof json.fetchedAt === "string" ? json.fetchedAt : undefined;
            return { docId: doc.id, title, ok: true as const, mode, fetchedAt, entities: ents };
          }
          return { docId: doc.id, title, ok: false as const, reason: "unexpected response shape" };
        } catch (err) {
          return {
            docId: doc.id,
            title,
            ok: false as const,
            reason: err instanceof Error ? err.message : "the request could not be completed",
          };
        }
      }),
    );

    const allEntities: Entity[] = [];
    const nextStatus = new Map<string, DocChartStatus>();
    for (const r of results) {
      if (r.ok) {
        allEntities.push(...r.entities);
        nextStatus.set(r.docId, {
          title: r.title,
          ok: true,
          mode: r.mode,
          fetchedAt: r.fetchedAt,
          count: r.entities.length,
        });
      } else {
        nextStatus.set(r.docId, { title: r.title, ok: false, reason: r.reason });
      }
    }
    setDocStatus(nextStatus);
    setEntities(allEntities);
    setCharting(false);
  }

  const elements = entities.length > 0 ? entitiesToElements(entities) : [];

  const kindCounts = new Map<Entity["kind"], { entities: number; mentions: number }>();
  for (const kind of ENTITY_KIND_ORDER) kindCounts.set(kind, { entities: 0, mentions: 0 });
  const seenByKind = new Map<Entity["kind"], Set<string>>();
  for (const e of entities) {
    const bucket = kindCounts.get(e.kind)!;
    bucket.mentions += e.mentions;
    const seen = seenByKind.get(e.kind) ?? new Set<string>();
    if (!seen.has(e.name)) {
      seen.add(e.name);
      bucket.entities += 1;
    }
    seenByKind.set(e.kind, seen);
  }

  const corpusUnavailable = corpusStatus === "unavailable" || corpusStatus === "empty";
  const nothingCharted = hasCharted && !charting && entities.length === 0;

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
        {corpusStatus === "loading" ? (
          <p style={dimMono}>corpus: loading…</p>
        ) : corpusUnavailable ? (
          <div
            style={{
              border: "1px solid var(--hairline)",
              borderRadius: "var(--radius)",
              padding: "calc(var(--space-unit) * 3)",
            }}
          >
            <LacunaState
              note={
                <>
                  {corpusStatus === "empty"
                    ? "The corpus has no documents yet."
                    : "The corpus isn't reachable yet."}{" "}
                  OCR a page in{" "}
                  <a href="/scriptorium" style={monoLink}>
                    Scriptorium
                  </a>{" "}
                  first — Prosopon charts entities recognized across saved documents.
                </>
              }
            />
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "calc(var(--space-unit) * 3)" }}>
              <button
                type="button"
                onClick={chartCorpus}
                disabled={charting}
                style={charting ? primaryButtonDisabled : primaryButton}
              >
                Chart the corpus
              </button>
              {charting ? <CollatingState /> : null}
              <MicroLabel tone="dim">
                {documents.length} document{documents.length === 1 ? "" : "s"} in the corpus
              </MicroLabel>
            </div>

            <section
              aria-label="Entity network"
              style={{ marginTop: "calc(var(--space-unit) * 3)" }}
            >
              <MicroLabel
                tone="dim"
                as="h2"
                style={{ display: "block", marginBottom: "calc(var(--space-unit) * 2)" }}
              >
                Entity network
              </MicroLabel>
              {nothingCharted ? (
                <div
                  style={{
                    border: "1px solid var(--hairline)",
                    borderRadius: "var(--radius)",
                    padding: "calc(var(--space-unit) * 3)",
                  }}
                >
                  <LacunaState note="No entities could be charted for any corpus document — see Sources charted in the margin." />
                </div>
              ) : (
                <OntologyGraph
                  elements={elements}
                  height="420px"
                  label="Entity co-occurrence network"
                />
              )}
            </section>
          </>
        )}
      </main>

      <ApparatusMargin title="Apparatus">
        <MarginSection label="Entity register">
          {entities.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "calc(var(--space-unit) * 1.5)" }}>
              {ENTITY_KIND_ORDER.map((kind, i) => {
                const bucket = kindCounts.get(kind)!;
                if (bucket.entities === 0) return null;
                return (
                  <div key={kind} style={{ display: "flex", alignItems: "center", gap: "var(--space-unit)" }}>
                    <span
                      aria-hidden
                      style={{
                        display: "inline-block",
                        width: "10px",
                        height: "10px",
                        background: `var(--chart-${i + 1})`,
                        border: "1px solid var(--hairline)",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "var(--text-mono)",
                        color: "var(--ink)",
                        flex: 1,
                      }}
                    >
                      {KIND_LABEL[kind]}
                    </span>
                    <span style={dimMono}>
                      {bucket.entities} · {bucket.mentions} mentions
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <LacunaState compact />
          )}
        </MarginSection>

        <MarginSection label="Sources charted">
          {docStatus.size > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "calc(var(--space-unit) * 1.5)" }}>
              {Array.from(docStatus.values()).map((s) => (
                <div key={s.title} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono)", color: "var(--ink)" }}>
                    {s.title}
                  </span>
                  {s.ok ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-unit)" }}>
                      <ProvenanceChip mode={s.mode} collatedAt={hhmm(s.fetchedAt)} />
                      <span style={dimMono}>{s.count} entities</span>
                    </div>
                  ) : (
                    <p style={dimMono}>LACUNA — {s.reason}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <LacunaState compact />
          )}
        </MarginSection>

        <MarginSection label="Co-occurrence">
          <p style={dimMono}>Edge label = number of documents both entities share.</p>
        </MarginSection>
      </ApparatusMargin>
    </div>
  );
}
