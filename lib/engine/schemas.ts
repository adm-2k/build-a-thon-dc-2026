/**
 * lib/engine/schemas.ts — THE single source of truth for data shapes.
 *
 * Every SPEC §3 type, verbatim names and fields, as a zod schema plus its
 * inferred TS type. All other code imports from here (CLAUDE.md engineering
 * rule 1): never redeclare a shape locally, never widen a type to make a
 * parse pass.
 *
 * SHAPE DISCIPLINE (DATA-CAVEATS addendum §3): Gemini structured output
 * accepts only a flat OpenAPI-3.0 subset — NO z.union() anywhere in this
 * file, ever. z.enum and .optional() are fine.
 *
 * Lane A (engine) is the sole committer of this file (ORCHESTRATION §2.3).
 * Disputes are decided by SPEC §3 verbatim; if SPEC is wrong, A amends SPEC
 * first, then this file follows.
 */
import { z } from "zod";

/* ────────────────────────────────────────────────────────────────────────
 * DepMode — provenance of every externally-derived datum (SPEC §3, §4)
 * ──────────────────────────────────────────────────────────────────────── */

export const DepModeSchema = z.enum(["live", "cached", "fixture"]);
export type DepMode = z.infer<typeof DepModeSchema>;

/* ────────────────────────────────────────────────────────────────────────
 * Claim — extractor output (SPEC §3)
 *
 * `confidence` is TRANSPORT-ONLY (ORCHESTRATION §8 T7): it is rendered in
 * the UI but never persisted — the §3b `claims` DDL has no column for it.
 * ──────────────────────────────────────────────────────────────────────── */

export const ClaimSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  text: z.string(),
  kind: z.enum(["empirical", "normative", "definitional"]),
  confidence: z.number(),
});
export type Claim = z.infer<typeof ClaimSchema>;

/* ────────────────────────────────────────────────────────────────────────
 * LogicalForm — formalizer output (SPEC §3), e.g. "P1 ∧ P2 → C"
 * ──────────────────────────────────────────────────────────────────────── */

export const LogicalFormSchema = z.object({
  claimId: z.string(),
  premises: z.array(z.string()),
  conclusion: z.string(),
  operator: z.enum(["asserts", "obligates", "permits", "predicts"]),
  formalization: z.string(),
});
export type LogicalForm = z.infer<typeof LogicalFormSchema>;

/* ────────────────────────────────────────────────────────────────────────
 * SourceVerdict — trace output (SPEC §3)
 * ──────────────────────────────────────────────────────────────────────── */

export const VerdictSourceSchema = z.object({
  url: z.string(),
  title: z.string(),
  quoteSpan: z.string().optional(),
  fetchedVia: DepModeSchema,
});
export type VerdictSource = z.infer<typeof VerdictSourceSchema>;

export const SourceVerdictSchema = z.object({
  claimId: z.string(),
  status: z.enum(["sourced", "weakly_sourced", "untraceable"]),
  sources: z.array(VerdictSourceSchema),
  rationale: z.string(),
});
export type SourceVerdict = z.infer<typeof SourceVerdictSchema>;

/* ────────────────────────────────────────────────────────────────────────
 * SourceDoc — a fetched/extracted page (SPEC §3)
 * (Declared before StanceCluster only because StanceCluster embeds it.)
 * ──────────────────────────────────────────────────────────────────────── */

export const SourceDocSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  extractedText: z.string().optional(),
  stanceClusterId: z.string().optional(),
});
export type SourceDoc = z.infer<typeof SourceDocSchema>;

/* ────────────────────────────────────────────────────────────────────────
 * StanceCluster — Map's typed stance ontology (SPEC §3)
 * agreesWith / disputes hold ids of OTHER StanceClusters.
 * ──────────────────────────────────────────────────────────────────────── */

export const StanceClusterSchema = z.object({
  id: z.string(),
  label: z.string(),
  sources: z.array(SourceDocSchema),
  coreClaimIds: z.array(z.string()),
  agreesWith: z.array(z.string()),
  disputes: z.array(z.string()),
  evidenceKind: z.string(),
});
export type StanceCluster = z.infer<typeof StanceClusterSchema>;

/* ────────────────────────────────────────────────────────────────────────
 * TermSnapshot — Begriffs harvest row (SPEC §3)
 * ──────────────────────────────────────────────────────────────────────── */

export const TermSenseSchema = z.object({
  gloss: z.string(),
  firstAttested: z.string().optional(),
  note: z.string(),
});
export type TermSense = z.infer<typeof TermSenseSchema>;

export const TermSnapshotSchema = z.object({
  term: z.string(),
  yearBucket: z.number().int(),
  relFreq: z.number().optional(),
  senses: z.array(TermSenseSchema),
  provenance: DepModeSchema,
});
export type TermSnapshot = z.infer<typeof TermSnapshotSchema>;

/* ────────────────────────────────────────────────────────────────────────
 * TickerEvent — hub marquee row (SPEC §3)
 * `at` is the timestamptz serialized as an ISO-8601 string on the wire.
 *
 * `instrument` is extended here from v1's ("01"|"02"|"03") to the full
 * five-instrument roster ("00".."04"): SPEC v2 §5 already names the new
 * verbs "N°00 · PAGE FIXED IN THE RECORD" and "N°04 · ENTITIES REGISTERED",
 * and ruling T11 fixed the hub at five catalogue cells — the v1 enum simply
 * never got updated to match. Flagged as a CROSS-LANE note; not a product
 * change, just closing a gap SPEC v2 already implies (Lane A is
 * schemas.ts's sole committer — ORCHESTRATION §2.3).
 * ──────────────────────────────────────────────────────────────────────── */

export const TickerEventSchema = z.object({
  instrument: z.enum(["00", "01", "02", "03", "04"]),
  verb: z.string(),
  count: z.number().int().optional(),
  at: z.string(),
});
export type TickerEvent = z.infer<typeof TickerEventSchema>;

/* ────────────────────────────────────────────────────────────────────────
 * OcrResult — Scriptorium transcription output (SPEC v2 §3, N°00)
 *
 * `model` is the EXACT HF (or Gemini-vision fallback) model id used for
 * this call — provenance in the scholarly sense (SPEC §4): the OCR
 * ProvenanceChip names the model, never just "LIVE".
 * ──────────────────────────────────────────────────────────────────────── */

export const OcrResultSchema = z.object({
  documentId: z.string(),
  text: z.string(),
  model: z.string(),
  script: z.enum(["print", "handwriting"]),
  language: z.enum(["en", "de", "mixed"]),
  pageNote: z.string().optional(),
});
export type OcrResult = z.infer<typeof OcrResultSchema>;

/* ────────────────────────────────────────────────────────────────────────
 * Entity — NER output (SPEC v2 §3, N°04)
 *
 * `kind` is a CLOSED vocabulary (DATA-CAVEATS addendum 2 §11) — the NER
 * prompt must instruct historical-text conventions and forbid inventing
 * kinds. EntityEdge is NOT a stored/transport type: co-occurrence edges are
 * derived in lib/engine/graph.ts (Lane C) from Entity[] grouped by document.
 * ──────────────────────────────────────────────────────────────────────── */

export const EntitySchema = z.object({
  id: z.string(),
  documentId: z.string(),
  name: z.string(),
  kind: z.enum(["person", "place", "org", "work", "concept"]),
  mentions: z.number().int(),
});
export type Entity = z.infer<typeof EntitySchema>;

/* ────────────────────────────────────────────────────────────────────────
 * Document — corpus row read-model (SPEC v2 §0/§2/§5)
 *
 * SPEC names `GET /api/documents` / `POST /api/documents` repeatedly (§2's
 * repository layout, §5's Scriptorium/Tracer/Map/Prosopon pipelines) but
 * never gives the shape a §3 type name — this fills that gap so the route
 * has something to validate against instead of returning `unknown` (CLAUDE.md
 * eng rule 1: every shape from schemas.ts). 1:1 with the six-table DDL's
 * `documents` row (SPEC §3b), camelCase on the wire like everything else;
 * `text`/`sourceUrl`/`tool` are optional because the DB columns are nullable.
 * ──────────────────────────────────────────────────────────────────────── */

export const DocumentSchema = z.object({
  id: z.string(),
  text: z.string().optional(),
  sourceUrl: z.string().optional(),
  tool: z.string().optional(),
  createdAt: z.string(),
});
export type Document = z.infer<typeof DocumentSchema>;

/* ════════════════════════════════════════════════════════════════════════
 * Engine transport types (SPEC §4 dependency ladder) — NOT §3 data
 * contracts, but inter-lane interfaces all the same: routes return them,
 * the UI renders the LACUNA state from them. Kept here so no lane ever
 * redeclares them (CLAUDE.md engineering rule 1).
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * The registered external dependencies (SPEC §4, DATA-CAVEATS §§1–6, plus
 * addendum 2 §§10–11's two SPEC v2 rungs — "ocr" and "ner").
 */
export const DEP_NAMES = [
  "search",
  "fetch",
  "gemini",
  "hf",
  "ngram",
  "wiktionary",
  "ocr",
  "ner",
] as const;
export const DepNameSchema = z.enum(DEP_NAMES);
export type DepName = z.infer<typeof DepNameSchema>;

/**
 * Lacuna — the typed bottom of the ladder. Never thrown: returned, so the
 * UI renders the LACUNA empty state (CLAUDE.md engineering rule 5 — errors
 * are states, not crashes).
 */
export const LacunaSchema = z.object({
  ok: z.literal(false),
  kind: z.literal("lacuna"),
  dep: DepNameSchema,
  key: z.string(),
  reason: z.string(),
  tried: z.array(DepModeSchema),
});
export type Lacuna = z.infer<typeof LacunaSchema>;

/** A successful ladder result, stamped with the provenance the UI chips render. */
export type DepSuccess<T> = {
  ok: true;
  data: T;
  mode: DepMode;
  /** ISO-8601 — present when served from dep_cache (drives `COLLATED HH:MM`). */
  fetchedAt?: string;
};

/** Every dep()/gemini()/hf() call resolves to this — success or Lacuna, never a throw. */
export type DepResult<T> = DepSuccess<T> | Lacuna;
