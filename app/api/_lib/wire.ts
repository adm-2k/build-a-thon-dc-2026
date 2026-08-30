/**
 * app/api/_lib/wire.ts — transport shapes and coercers for the /api routes.
 *
 * Rule of authority: every SPEC §3 data shape lives in lib/engine/schemas.ts
 * and is imported — never redeclared. What lives here is strictly transport:
 * request envelopes, wire subsets sent to the LLM (server-stamped fields
 * omitted so models never invent ids), and tolerant coercers that turn a dep
 * ladder payload (live result or fixture JSON) into a §3 type. Every coercer
 * finishes with a schemas.ts parse — off-contract data becomes a state
 * (lacuna / weakly_sourced), never a widened type.
 *
 * All LLM wire schemas are FLAT — no z.union anywhere: Gemini structured
 * output rejects it (DATA-CAVEATS addendum §3). z.enum is fine.
 */
import { z } from "zod";
import {
  ClaimSchema,
  DocumentSchema,
  EntitySchema,
  LogicalFormSchema,
  OcrResultSchema,
  SourceVerdictSchema,
  StanceClusterSchema,
  TermSnapshotSchema,
  TickerEventSchema,
  type Claim,
  type DepMode,
  type Document,
  type Entity,
  type LogicalForm,
  type OcrResult,
  type SourceVerdict,
  type StanceCluster,
  type TermSnapshot,
  type TickerEvent,
} from "@/lib/engine/schemas";
import { isRecord } from "./adapter";

/* ------------------------------------------------- request envelopes ------ */

export const ExtractRequestSchema = z.object({
  text: z.string().min(1, "paste some text to collate").max(50_000),
});

export const StanceRequestSchema = z.object({
  question: z.string().min(1, "a contested question is required").max(500),
});

/**
 * POST /api/ner body (SPEC v2 §5, N°04) — the client sends only the id
 * (already-merged Prosopon page: `{documentId}`); the route looks up the
 * document's text itself. `fixture` is an optional forward-compat hook
 * (same rationale as OcrRequestSchema.fixture): no slug is guessed
 * server-side from a random document id, so an unnamed request in fixture
 * mode correctly bottoms out at a typed LACUNA rather than attributing an
 * unrelated corpus page's entities to the wrong document.
 */
export const NerRequestSchema = z.object({
  documentId: z.string().min(1, "a document id is required"),
  fixture: z.string().min(1).optional(),
});

/**
 * POST /api/ocr body (SPEC v2 §5, N°00). `script`/`language` are hints that
 * shape the prompt (Scriptorium's toggles) — when omitted the model
 * determines them itself; coerceOcrResult() prefers the request's values
 * when given (CLAUDE.md eng rule 1: server truth, never a model guess,
 * once the human has actually stated it).
 *
 * `fixture` names the corpus slug for the fixture-mode floor (e.g.
 * "eb1911-rationalism" — see fixtures/ocr/*.json). Deliberately NOT
 * defaulted to any one demo image server-side: substituting an unrelated
 * page's transcription for whatever the caller actually uploaded would be
 * a silent illusion (DATA-CAVEATS judge-facing summary: "honesty over
 * illusion") — an unnamed request in fixture mode correctly bottoms out
 * at a typed LACUNA (no fixtures/ocr/default.json exists, nor should one
 * fake a match). Callers that know which corpus page they're re-running
 * (Scriptorium, once it tracks a corpus slug) pass this to get the real
 * canned transcription instead.
 */
export const OcrRequestSchema = z.object({
  imageDataUrl: z
    .string()
    .min(1, "an image is required")
    .refine((v) => v.startsWith("data:image/"), "must be a data:image/… URL"),
  model: z.string().min(1).optional(),
  script: OcrResultSchema.shape.script.optional(),
  language: OcrResultSchema.shape.language.optional(),
  fixture: z.string().min(1).optional(),
});

/**
 * POST /api/documents body (SPEC v2 §5) — Scriptorium's "Fix in the record"
 * (also the eventual home for Tracer's paste box, SPEC §0). `ocr` is
 * present only when the save originated from a transcription; its
 * `model`/`script`/`language` feed the dep_cache OCR-metadata write-through
 * (SPEC §3b) keyed on the sha256 embedded in `sourceUrl` as
 * "scriptorium:<sha256>" — never re-derived, since that IS the image
 * content hash SPEC §3b calls for.
 */
export const DocumentCreateRequestSchema = z.object({
  text: z.string().min(1, "transcription text is required"),
  sourceUrl: z.string().min(1).optional(),
  tool: z.string().min(1).optional(),
  ocr: z
    .object({
      model: z.string().min(1),
      script: OcrResultSchema.shape.script,
      language: OcrResultSchema.shape.language,
    })
    .optional(),
});

/** POST /api/events body — the server stamps `at`, so the client never sends it. */
export const EventInputSchema = TickerEventSchema.omit({ at: true });

/* ----------------------------------------------- LLM wire schemas --------- */

/** Extractor output: id/documentId are server-stamped after the call. */
export const ExtractionWire = z.object({
  claims: z.array(ClaimSchema.omit({ id: true, documentId: true })),
});

/** Formalizer output: claimId is re-attached by the route. */
export const FormalizeWire = LogicalFormSchema.omit({ claimId: true });

/**
 * Judge output: claimId and per-source fetchedVia are server truths — the
 * model only assesses. The full §3 SourceVerdict is assembled in the route
 * and parsed against SourceVerdictSchema before returning.
 */
export const JudgeWire = z.object({
  status: SourceVerdictSchema.shape.status,
  rationale: z.string(),
  sources: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      quoteSpan: z.string().optional(),
    }),
  ),
});

/** Stance clustering output — §3 StanceCluster[] under one object key. */
export const ClustersWire = z.object({
  clusters: z.array(StanceClusterSchema),
});

/**
 * OCR output: documentId is server-stamped after the call (a fresh
 * correlation id per request, same pattern as ExtractionWire — NOT tied to
 * a persisted `documents` row until "Fix in the record" writes one).
 * `model` IS part of this wire: hfVision()'s withModel() stamps the model
 * that actually answered onto the raw completion before validation, so it
 * round-trips correctly through dep_cache/fixtures/ocr/ (SPEC §3b) — the
 * model itself never has to self-report it.
 */
export const OcrWire = OcrResultSchema.omit({ documentId: true });

/**
 * NER output — a BARE array, not `{ entities: [...] }`: matches Lane D's
 * already-committed fixtures/ner/*.json shape exactly (registered in
 * scripts/seed-fixtures.ts as `z.array(EntitySchema.omit({id,documentId}))`)
 * — the wire schema here must equal that on-disk shape or the fixture
 * floor fails validation for everyone. `id`/`documentId` are server-stamped
 * after the call, same pattern as ExtractionWire.
 */
export const NerWire = z.array(EntitySchema.omit({ id: true, documentId: true }));

/* ------------------------------------------- dependency wire coercers ----- */

const SearchResultWire = z.object({
  url: z.string().min(1),
  title: z.string().optional(),
  snippet: z.string().optional(),
  content: z.string().optional(), // Tavily's name for the snippet (addendum §1)
});

export type SearchResult = { url: string; title: string; snippet?: string };

/** Accepts a bare array or { results: [...] } (Tavily shape); drops malformed rows. */
export function coerceSearchResults(data: unknown): SearchResult[] {
  const raw = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.results)
      ? data.results
      : null;
  if (!raw) return [];
  const out: SearchResult[] = [];
  for (const item of raw) {
    const parsed = SearchResultWire.safeParse(item);
    if (!parsed.success) continue;
    out.push({
      url: parsed.data.url,
      title: parsed.data.title ?? parsed.data.url,
      snippet: parsed.data.snippet ?? parsed.data.content,
    });
  }
  return out;
}

const PageWire = z.object({
  url: z.string().optional(),
  title: z.string().optional(),
  text: z.string().optional(),
  extractedText: z.string().optional(),
  content: z.string().optional(),
});

export type ExtractedPage = { url: string; title?: string; text: string };

/**
 * An empty extraction is a RESULT (DATA-CAVEATS §2): null here degrades the
 * verdict to weakly_sourced in the route — never a retry loop.
 */
export function coercePage(data: unknown, requestedUrl: string): ExtractedPage | null {
  if (typeof data === "string") {
    return data.trim() ? { url: requestedUrl, text: data } : null;
  }
  const parsed = PageWire.safeParse(data);
  if (!parsed.success) return null;
  const text = parsed.data.text ?? parsed.data.extractedText ?? parsed.data.content;
  if (!text || !text.trim()) return null;
  return { url: parsed.data.url ?? requestedUrl, title: parsed.data.title, text };
}

/* -------------------------------------------------- §3 output coercers ---- */

/**
 * unknown (live LLM output or fixture JSON — bare Claim[] or { claims })
 * → Claim[] stamped with server ids, or null when off-contract.
 */
export function coerceClaims(data: unknown, documentId: string): Claim[] | null {
  const raw = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.claims)
      ? data.claims
      : null;
  if (!raw) return null;
  const stamped = raw.map((item) => {
    if (!isRecord(item)) return item;
    const id = typeof item.id === "string" && item.id.length > 0 ? item.id : crypto.randomUUID();
    return { ...item, id, documentId };
  });
  const parsed = z.array(ClaimSchema).safeParse(stamped);
  return parsed.success ? parsed.data : null;
}

/** unknown → LogicalForm bound to the requesting claim, or null. */
export function coerceLogicalForm(data: unknown, claimId: string): LogicalForm | null {
  const candidate = isRecord(data) && isRecord(data.logicalForm) ? data.logicalForm : data;
  if (!isRecord(candidate)) return null;
  const parsed = LogicalFormSchema.safeParse({ ...candidate, claimId });
  return parsed.success ? parsed.data : null;
}

/**
 * unknown (judge output or fixture verdict) → SourceVerdict with claimId and
 * per-source fetchedVia set from server truth, or null.
 */
export function coerceVerdict(
  data: unknown,
  claimId: string,
  viaByUrl: ReadonlyMap<string, DepMode>,
  defaultVia: DepMode,
): SourceVerdict | null {
  const candidate = isRecord(data) && isRecord(data.verdict) ? data.verdict : data;
  if (!isRecord(candidate)) return null;
  const rawSources = Array.isArray(candidate.sources) ? candidate.sources : [];
  const sources = rawSources.filter(isRecord).map((source) => ({
    ...source,
    fetchedVia:
      typeof source.fetchedVia === "string"
        ? source.fetchedVia
        : (viaByUrl.get(typeof source.url === "string" ? source.url : "") ?? defaultVia),
  }));
  const parsed = SourceVerdictSchema.safeParse({ ...candidate, claimId, sources });
  return parsed.success ? parsed.data : null;
}

/**
 * unknown (bare StanceCluster[] or { clusters }) → StanceCluster[] with ids
 * filled and each member source back-linked via stanceClusterId, or null.
 */
export function coerceClusters(data: unknown): StanceCluster[] | null {
  const raw = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.clusters)
      ? data.clusters
      : null;
  if (!raw) return null;
  const prepared = raw.map((cluster) => {
    if (!isRecord(cluster)) return cluster;
    const id =
      typeof cluster.id === "string" && cluster.id.length > 0
        ? cluster.id
        : crypto.randomUUID();
    const sources = Array.isArray(cluster.sources)
      ? cluster.sources.map((source) =>
          isRecord(source)
            ? {
                ...source,
                id:
                  typeof source.id === "string" && source.id.length > 0
                    ? source.id
                    : crypto.randomUUID(),
                stanceClusterId:
                  typeof source.stanceClusterId === "string" && source.stanceClusterId.length > 0
                    ? source.stanceClusterId
                    : id,
              }
            : source,
        )
      : cluster.sources;
    return { ...cluster, id, sources };
  });
  const parsed = z.array(StanceClusterSchema).safeParse(prepared);
  return parsed.success ? parsed.data : null;
}

/**
 * unknown (OcrWire-shaped live/cached/fixture payload) → OcrResult stamped
 * with a fresh documentId, or null when off-contract. The request's own
 * script/language — when the caller supplied them — win over whatever the
 * model reported: a human-stated toggle is server truth once given (CLAUDE.md
 * eng rule 1), the model's own determination is only the fallback for the
 * omitted case.
 */
export function coerceOcrResult(
  data: unknown,
  documentId: string,
  hints: { script?: OcrResult["script"]; language?: OcrResult["language"] },
): OcrResult | null {
  if (!isRecord(data)) return null;
  const candidate = {
    ...data,
    documentId,
    script: hints.script ?? data.script,
    language: hints.language ?? data.language,
  };
  const parsed = OcrResultSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * unknown (NerWire-shaped live/cached/fixture payload — a bare array) →
 * Entity[] stamped with server ids and the requesting documentId, or null
 * when off-contract. Malformed individual rows drop rather than failing
 * the whole batch (DATA-CAVEATS addendum 2 §11: under-merging/under-listing
 * is honest, inventing or keeping a bad row is not).
 */
export function coerceEntities(data: unknown, documentId: string): Entity[] | null {
  if (!Array.isArray(data)) return null;
  const out: Entity[] = [];
  for (const item of data) {
    if (!isRecord(item)) continue;
    const id =
      typeof item.id === "string" && item.id.length > 0
        ? item.id
        : `${documentId}:${typeof item.name === "string" ? item.name : crypto.randomUUID()}`;
    const parsed = EntitySchema.safeParse({ ...item, id, documentId });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * unknown `documents` DB row (snake_case) → Document (camelCase), or null
 * when off-contract. Null DB columns normalize to undefined (schema-optional).
 */
export function coerceDocument(row: unknown): Document | null {
  if (!isRecord(row)) return null;
  const candidate = {
    id: row.id,
    text: row.raw_text ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    tool: row.tool ?? undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
  const parsed = DocumentSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** unknown `documents` DB rows[] → Document[]; malformed rows drop. */
export function coerceDocuments(rows: unknown): Document[] {
  if (!Array.isArray(rows)) return [];
  const out: Document[] = [];
  for (const row of rows) {
    const doc = coerceDocument(row);
    if (doc) out.push(doc);
  }
  return out;
}

/**
 * unknown `term_snapshots` DB row → TermSnapshot, or null when off-contract.
 * The DDL nests `relFreq`/`senses` under a `data` JSONB column
 * (scripts/seed-fixtures.ts's --seed column mapping: `{term, year_bucket,
 * data: {relFreq?, senses}, provenance}`) — this flattens it back onto the
 * §3 shape, camelCase on the wire.
 */
export function coerceTermSnapshot(row: unknown): TermSnapshot | null {
  if (!isRecord(row)) return null;
  const data = isRecord(row.data) ? row.data : {};
  const candidate = {
    term: row.term,
    yearBucket: row.year_bucket,
    relFreq: data.relFreq ?? undefined,
    senses: data.senses ?? [],
    provenance: row.provenance,
  };
  const parsed = TermSnapshotSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** unknown `term_snapshots` DB rows[] → TermSnapshot[]; malformed rows drop. */
export function coerceTermSnapshots(rows: unknown): TermSnapshot[] {
  if (!Array.isArray(rows)) return [];
  const out: TermSnapshot[] = [];
  for (const row of rows) {
    const snap = coerceTermSnapshot(row);
    if (snap) out.push(snap);
  }
  return out;
}

/** unknown DB rows → TickerEvent[]; malformed rows drop, `at` normalizes to ISO. */
export function coerceEvents(data: unknown): TickerEvent[] {
  const raw = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.data)
      ? data.data
      : [];
  const out: TickerEvent[] = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const normalized = {
      ...row,
      count: row.count ?? undefined, // DB null → schema-optional
      at: row.at instanceof Date ? row.at.toISOString() : row.at,
    };
    const parsed = TickerEventSchema.safeParse(normalized);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
