import "server-only";

/**
 * lib/db.ts — the ONLY Supabase surface in the codebase.
 *
 * - Server-only by construction (the import above makes any client-component
 *   import a build error). The service-role key never reaches a client.
 * - `SUPABASE_SERVICE_ROLE_KEY` holds the new `sb_secret_…` key (DATA-CAVEATS
 *   addendum §7) — a drop-in for createClient.
 * - KEYLESS MODE: when the Supabase vars are absent, every helper warns once
 *   and no-ops (returns empty/ok) so fixture-mode lanes and the keyless smoke
 *   gate work with no DB at all. Errors are states, not crashes.
 * - Six tables, per SPEC §3b: documents, claims, source_docs, term_snapshots,
 *   dep_cache, events. No new tables without amending SPEC §3b first.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/* ── row types (snake_case DB shapes, 1:1 with the SPEC §3b DDL) ────────── */

export interface DocumentRow {
  id: string;
  raw_text: string | null;
  source_url: string | null;
  tool: string | null;
  created_at: string;
}

export interface ClaimRow {
  id: string;
  document_id: string | null;
  text: string | null;
  kind: string | null;
  logical_form: unknown;
  verdict: unknown;
  created_at: string;
}

export interface SourceDocRow {
  id: string;
  query: string | null;
  url: string | null;
  title: string | null;
  extracted_text: string | null;
  stance: unknown;
  created_at: string;
}

export interface TermSnapshotRow {
  term: string;
  year_bucket: number;
  data: unknown;
  provenance: string | null;
}

export interface DepCacheRow {
  dep: string;
  key_hash: string;
  payload: unknown;
  fetched_at: string;
}

export interface EventRow {
  id: number;
  instrument: string;
  verb: string;
  count: number | null;
  at: string;
}

/* ── client (lazy singleton; null in keyless mode) ──────────────────────── */

let client: SupabaseClient | null | undefined;

function getClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (!env.supabaseConfigured) {
    client = null;
    return null;
  }
  client = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}

const warned = new Set<string>();
function noopWarn(helper: string): void {
  if (warned.has(helper)) return;
  warned.add(helper);
  console.warn(
    `[db] Supabase env absent — ${helper} is a no-op (keyless/fixture mode)`,
  );
}

function opWarn(helper: string, error: { message?: string } | string): void {
  const message = typeof error === "string" ? error : (error.message ?? "unknown");
  console.warn(`[db] ${helper} failed: ${message}`);
}

/**
 * One retry for a write op (DATA-CAVEATS §7: "all writes go through helper
 * functions in db.ts so there is exactly one place to add retry" — this is
 * that place). Venue wifi and momentary Supabase connection blips are the
 * expected failure mode (DATA-CAVEATS §9), not bad data — a second failure
 * after the retry is a real state (the caller's null/false/[] return),
 * never an infinite loop. No lane adds its own retry loop elsewhere.
 */
async function retryWrite<T>(
  label: string,
  // PromiseLike, not Promise: supabase-js query builders are thenable but
  // don't implement the full Promise interface (.catch/.finally).
  op: () => PromiseLike<{ data: T; error: { message?: string } | null }>,
): Promise<{ data: T; error: { message?: string } | null }> {
  const first = await op();
  if (!first.error) return first;
  console.warn(`[db] ${label} failed (${first.error.message ?? "unknown"}) — one retry`);
  return op();
}

/* ── documents ──────────────────────────────────────────────────────────── */

export async function insertDocument(row: {
  raw_text?: string;
  source_url?: string;
  tool?: string;
}): Promise<DocumentRow | null> {
  const c = getClient();
  if (!c) return noopWarn("insertDocument"), null;
  const { data, error } = await retryWrite("insertDocument", () =>
    c.from("documents").insert(row).select().single(),
  );
  if (error) return opWarn("insertDocument", error), null;
  return data as DocumentRow;
}

/** Corpus list — Tracer's corpus picker, Map's multi-select, Prosopon's
 * per-document NER sweep (SPEC v2 §5). Newest first; [] keyless (LACUNA). */
export async function listDocuments(limit = 100): Promise<DocumentRow[]> {
  const c = getClient();
  if (!c) return noopWarn("listDocuments"), [];
  const { data, error } = await c
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return opWarn("listDocuments", error), [];
  return (data ?? []) as DocumentRow[];
}

/** One document by id — /api/ner looks up the text to run NER on from the
 * id alone (SPEC v2 §5: the client sends {documentId}, never the text
 * itself). null on any miss (keyless, not-found, or error) — the route
 * turns that into a LACUNA state. */
export async function getDocumentById(id: string): Promise<DocumentRow | null> {
  const c = getClient();
  if (!c) return noopWarn("getDocumentById"), null;
  const { data, error } = await c
    .from("documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return opWarn("getDocumentById", error), null;
  return (data as DocumentRow | null) ?? null;
}

/* ── claims ─────────────────────────────────────────────────────────────── */

export async function insertClaims(
  rows: Array<{
    document_id?: string;
    text?: string;
    kind?: string;
    logical_form?: unknown;
    verdict?: unknown;
  }>,
): Promise<ClaimRow[]> {
  const c = getClient();
  if (!c) return noopWarn("insertClaims"), [];
  const { data, error } = await retryWrite("insertClaims", () =>
    c.from("claims").insert(rows).select(),
  );
  if (error) return opWarn("insertClaims", error), [];
  return (data ?? []) as ClaimRow[];
}

export async function updateClaim(
  id: string,
  patch: { logical_form?: unknown; verdict?: unknown },
): Promise<boolean> {
  const c = getClient();
  if (!c) return noopWarn("updateClaim"), true; // ok in keyless mode
  const { error } = await retryWrite("updateClaim", () => c.from("claims").update(patch).eq("id", id));
  if (error) return opWarn("updateClaim", error), false;
  return true;
}

/* ── source_docs ────────────────────────────────────────────────────────── */

export async function insertSourceDocs(
  rows: Array<{
    query?: string;
    url?: string;
    title?: string;
    extracted_text?: string;
    stance?: unknown;
  }>,
): Promise<SourceDocRow[]> {
  const c = getClient();
  if (!c) return noopWarn("insertSourceDocs"), [];
  const { data, error } = await retryWrite("insertSourceDocs", () =>
    c.from("source_docs").insert(rows).select(),
  );
  if (error) return opWarn("insertSourceDocs", error), [];
  return (data ?? []) as SourceDocRow[];
}

/* ── term_snapshots ─────────────────────────────────────────────────────── */

export async function upsertTermSnapshots(
  rows: Array<{
    term: string;
    year_bucket: number;
    data?: unknown;
    provenance?: string;
  }>,
): Promise<boolean> {
  const c = getClient();
  if (!c) return noopWarn("upsertTermSnapshots"), true;
  const { error } = await retryWrite("upsertTermSnapshots", () =>
    c.from("term_snapshots").upsert(rows, { onConflict: "term,year_bucket" }),
  );
  if (error) return opWarn("upsertTermSnapshots", error), false;
  return true;
}

export async function listTermSnapshots(
  term?: string,
): Promise<TermSnapshotRow[]> {
  const c = getClient();
  if (!c) return noopWarn("listTermSnapshots"), [];
  const base = c.from("term_snapshots").select("*");
  const filtered = term !== undefined ? base.eq("term", term) : base;
  const { data, error } = await filtered.order("year_bucket");
  if (error) return opWarn("listTermSnapshots", error), [];
  return (data ?? []) as TermSnapshotRow[];
}

/* ── dep_cache (the generic write-through cache behind the SPEC §4 ladder) ─ */

export async function readDepCache(
  dep: string,
  keyHash: string,
): Promise<DepCacheRow | null> {
  const c = getClient();
  if (!c) return noopWarn("readDepCache"), null; // miss → ladder falls to fixture
  const { data, error } = await c
    .from("dep_cache")
    .select("*")
    .eq("dep", dep)
    .eq("key_hash", keyHash)
    .maybeSingle();
  if (error) return opWarn("readDepCache", error), null;
  return (data as DepCacheRow | null) ?? null;
}

export async function writeDepCache(
  dep: string,
  keyHash: string,
  payload: unknown, // derived JSON only — NEVER raw HTML (DATA-CAVEATS §7)
): Promise<boolean> {
  const c = getClient();
  if (!c) return noopWarn("writeDepCache"), true;
  const { error } = await retryWrite("writeDepCache", () =>
    c.from("dep_cache").upsert(
      { dep, key_hash: keyHash, payload, fetched_at: new Date().toISOString() },
      { onConflict: "dep,key_hash" },
    ),
  );
  if (error) return opWarn("writeDepCache", error), false;
  return true;
}

/* ── events (hub ticker) ────────────────────────────────────────────────── */

export async function insertEvent(row: {
  instrument: "00" | "01" | "02" | "03" | "04";
  verb: string;
  count?: number;
}): Promise<EventRow | null> {
  const c = getClient();
  if (!c) return noopWarn("insertEvent"), null;
  const { data, error } = await retryWrite("insertEvent", () =>
    c.from("events").insert(row).select().single(),
  );
  if (error) return opWarn("insertEvent", error), null;
  return data as EventRow;
}

export async function listRecentEvents(limit = 20): Promise<EventRow[]> {
  const c = getClient();
  if (!c) return noopWarn("listRecentEvents"), [];
  const { data, error } = await c
    .from("events")
    .select("*")
    .order("at", { ascending: false })
    .limit(limit);
  if (error) return opWarn("listRecentEvents", error), [];
  return (data ?? []) as EventRow[];
}
