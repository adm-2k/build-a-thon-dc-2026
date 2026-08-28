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
 * ──────────────────────────────────────────────────────────────────────── */

export const TickerEventSchema = z.object({
  instrument: z.enum(["01", "02", "03"]),
  verb: z.string(),
  count: z.number().int().optional(),
  at: z.string(),
});
export type TickerEvent = z.infer<typeof TickerEventSchema>;

/* ════════════════════════════════════════════════════════════════════════
 * Engine transport types (SPEC §4 dependency ladder) — NOT §3 data
 * contracts, but inter-lane interfaces all the same: routes return them,
 * the UI renders the LACUNA state from them. Kept here so no lane ever
 * redeclares them (CLAUDE.md engineering rule 1).
 * ════════════════════════════════════════════════════════════════════════ */

/** The registered external dependencies (SPEC §4, DATA-CAVEATS §§1–6). */
export const DEP_NAMES = [
  "search",
  "fetch",
  "gemini",
  "hf",
  "ngram",
  "wiktionary",
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
