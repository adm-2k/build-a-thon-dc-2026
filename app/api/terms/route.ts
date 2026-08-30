/**
 * GET /api/terms[?term=…] — Begriffs harvest read (SPEC v2 §3/§5, N°03).
 *
 * Harvest-time only (DATA-CAVEATS §5/§6): this route never calls Ngram or
 * Wiktionary live — it reads the term_snapshots rows scripts/harvest-
 * begriffs.ts + seed-fixtures.ts --seed already wrote. Century buckets
 * 1500–1900 plus decade buckets 1890–1950 for the five seed terms all
 * live in the same table, disambiguated only by `yearBucket`'s value; the
 * page's century⇄decade toggle is purely a client-side filter over the
 * same response.
 *
 * `?term=` filters to one term (the term detail view); omitted returns
 * every row (the term picker enumerates distinct `term` values from this).
 * Empty result is a state, not an error — the page renders its own LACUNA
 * panel when no harvest rows exist for the requested term.
 *
 * `mode` is always "cached": DATA-CAVEATS §5/§6 fixes ngram/Wiktionary at
 * harvest-time-only, never live in deployed code — reporting "live" here
 * (the response envelope's default when `mode` is omitted) would mislabel
 * the Begriffs ProvenanceChip on every render.
 */
import { listTermSnapshots } from "@/lib/db";
import { guard, ok } from "../_lib/respond";
import { coerceTermSnapshots } from "../_lib/wire";

export const maxDuration = 60;

export const GET = guard(async (req) => {
  const { searchParams } = new URL(req.url);
  const term = searchParams.get("term")?.trim() || undefined;

  const rows = await listTermSnapshots(term);
  return ok(coerceTermSnapshots(rows), { mode: "cached" });
});
