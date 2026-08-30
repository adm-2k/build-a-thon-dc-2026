/**
 * scripts/seed-fixtures.ts — fixture validation (and, later, DB seeding).
 *
 *   node scripts/seed-fixtures.ts --check
 *     zod-parses EVERY file under fixtures/ against the registry below;
 *     exits 0 only when all pass (ORCHESTRATION §6 — part of the global
 *     smoke gate, keyless by construction: no env, no DB, no network).
 *
 * Runs under plain Node ≥24 type stripping: relative imports carry the .ts
 * extension and no path aliases are used (tsconfig's "@/*" does not resolve
 * outside the Next build). Do NOT import lib/db.ts or app/api/_lib/* here —
 * they pull in "server-only", which throws outside the React server.
 *
 * Check schemas are COMPOSED from lib/engine/schemas.ts (never redeclared —
 * CLAUDE.md eng rule 1). The wire subsets mirror app/api/_lib/wire.ts; that
 * duplication is deliberate script isolation (see the server-only note).
 *
 * A fixture with no registry entry FAILS — register a schema when adding a
 * new fixture family; nothing ships unvalidated.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { z } from "zod";
import {
  ClaimSchema,
  EntitySchema,
  LogicalFormSchema,
  OcrResultSchema,
  SourceVerdictSchema,
  StanceClusterSchema,
  TermSnapshotSchema,
} from "../lib/engine/schemas.ts";

/* ── check schemas (composed, transport-shaped — see header) ────────────── */

const DemoParagraph = z.object({ text: z.string().min(1) });

const SearchFixture = z.object({
  query: z.string().optional(),
  results: z.array(
    z.object({
      url: z.string().min(1),
      title: z.string().optional(),
      snippet: z.string().optional(),
      content: z.string().optional(), // Tavily's snippet name (addendum §1)
    }),
  ),
});

const FetchFixture = z.object({
  id: z.string().optional(),
  url: z.string().min(1),
  title: z.string().optional(),
  extractedText: z.string().min(1),
});

const ExtractWire = z.object({
  claims: z.array(ClaimSchema.omit({ id: true, documentId: true })),
});

const ClustersWire = z.object({ clusters: z.array(StanceClusterSchema) });

const JudgeWire = z.object({
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

const FormalizeWire = LogicalFormSchema.omit({ claimId: true });

const TermSnapshotArray = z.array(TermSnapshotSchema);

/** documentId is assigned at /api/documents insert time — the committed
 * corpus fixture is the pre-insert wire shape (matches the ClaimWire/
 * FormalizeWire omit-the-id-fields precedent above). */
const OcrResultWire = OcrResultSchema.omit({ documentId: true });
const EntityWireArray = z.array(EntitySchema.omit({ id: true, documentId: true }));

/* ── registry: fixtures/<dir>/<file matching pattern> → schema ──────────── */

interface RegistryEntry {
  dir: string;
  pattern: RegExp;
  schema: z.ZodType<unknown>;
  shape: string;
}

const REGISTRY: RegistryEntry[] = [
  { dir: "demo", pattern: /.*/, schema: DemoParagraph, shape: "{ text }" },
  { dir: "search", pattern: /.*/, schema: SearchFixture, shape: "{ query?, results[] }" },
  { dir: "fetch", pattern: /.*/, schema: FetchFixture, shape: "{ url, extractedText }" },
  { dir: "gemini", pattern: /^extract/, schema: ExtractWire, shape: "{ claims[] } (wire)" },
  { dir: "gemini", pattern: /^stance/, schema: ClustersWire, shape: "{ clusters[] }" },
  { dir: "gemini", pattern: /^judge/, schema: JudgeWire, shape: "{ status, rationale, sources[] }" },
  { dir: "gemini", pattern: /^formalize/, schema: FormalizeWire, shape: "LogicalForm sans claimId" },
  { dir: "hf", pattern: /^formalize/, schema: FormalizeWire, shape: "LogicalForm sans claimId" },
  { dir: "hf", pattern: /^default/, schema: FormalizeWire, shape: "LogicalForm sans claimId" },
  { dir: "ngram", pattern: /.*/, schema: TermSnapshotArray, shape: "TermSnapshot[]" },
  { dir: "wiktionary", pattern: /.*/, schema: TermSnapshotSchema, shape: "TermSnapshot" },
  { dir: "ocr", pattern: /.*/, schema: OcrResultWire, shape: "OcrResult sans documentId" },
  { dir: "ner", pattern: /.*/, schema: EntityWireArray, shape: "Entity[] sans id/documentId" },
];

function entryFor(relPath: string): RegistryEntry | undefined {
  const [dir, ...rest] = relPath.split(path.sep);
  const file = rest.join(path.sep);
  return REGISTRY.find((e) => e.dir === dir && e.pattern.test(file));
}

/* ── the check ──────────────────────────────────────────────────────────── */

async function listJsonFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    out.push(path.relative(root, path.join(entry.parentPath, entry.name)));
  }
  return out.sort();
}

async function check(): Promise<number> {
  const root = path.join(process.cwd(), "fixtures");
  const files = await listJsonFiles(root);
  if (files.length === 0) {
    console.error("FAIL  fixtures/ contains no .json files");
    return 1;
  }
  let failures = 0;
  for (const rel of files) {
    const entry = entryFor(rel);
    if (!entry) {
      console.error(`FAIL  fixtures/${rel} — no registry entry; register its schema in scripts/seed-fixtures.ts`);
      failures++;
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await fs.readFile(path.join(root, rel), "utf8"));
    } catch (err) {
      console.error(`FAIL  fixtures/${rel} — invalid JSON: ${err instanceof Error ? err.message : err}`);
      failures++;
      continue;
    }
    const parsed = entry.schema.safeParse(raw);
    if (parsed.success) {
      console.log(`PASS  fixtures/${rel} (${entry.shape})`);
    } else {
      console.error(`FAIL  fixtures/${rel} — expected ${entry.shape}:\n${z.prettifyError(parsed.error)}`);
      failures++;
    }
  }
  console.log(failures === 0 ? `\nall ${files.length} fixtures IN REGISTER` : `\n${failures}/${files.length} fixtures OFF REGISTER`);
  return failures === 0 ? 0 : 1;
}

/* ── entry point ────────────────────────────────────────────────────────── */

/**
 * `node scripts/seed-fixtures.ts --seed` — loads the Begriffs harvest
 * (fixtures/ngram/ + fixtures/wiktionary/) into `term_snapshots` via a
 * direct @supabase/supabase-js client (lib/db.ts is server-only and cannot
 * be imported from a script — see the file header). Mirrors lib/db.ts's
 * `upsertTermSnapshots` column mapping exactly: `{term, year_bucket, data,
 * provenance}`, `data` = `{relFreq?, senses}`, upsert `onConflict:
 * "term,year_bucket"` (idempotent — safe to re-run).
 *
 * Deliberately NOT in scope here: pre-warming `dep_cache` for the demo
 * search/fetch/gemini fixtures. Those live-verified query/answer pairs need
 * the exact content-hash key `lib/engine/llm.ts`/`dep.ts` (Lane A) computes
 * for the identical prompt at runtime; duplicating that hash function here
 * would violate CLAUDE.md eng rule 1 territory (own it or don't touch it).
 * Warming dep_cache for the live demo is ORCHESTRATION §7/§10's "demo-query
 * prerendering" checkpoint — the human orchestrator running the actual
 * queries against the deployed app, not a seed script.
 */
async function seed(): Promise<number> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "FAIL  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — seed mode needs live " +
        "credentials (run with `node --env-file=.env.local scripts/seed-fixtures.ts --seed`)",
    );
    return 1;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const root = path.join(process.cwd(), "fixtures");
  type Row = { term: string; year_bucket: number; data: unknown; provenance: string };
  const rows: Row[] = [];
  let failures = 0;

  const readJson = async (rel: string): Promise<unknown> =>
    JSON.parse(await fs.readFile(path.join(root, rel), "utf8"));

  const ngramFiles = await fs.readdir(path.join(root, "ngram")).catch(() => [] as string[]);
  for (const file of ngramFiles.filter((f) => f.endsWith(".json"))) {
    const parsed = TermSnapshotArray.safeParse(await readJson(path.join("ngram", file)));
    if (!parsed.success) {
      console.error(`FAIL  fixtures/ngram/${file} failed TermSnapshot[] validation — skipped`);
      failures++;
      continue;
    }
    for (const snap of parsed.data) {
      rows.push({
        term: snap.term,
        year_bucket: snap.yearBucket,
        data: { relFreq: snap.relFreq, senses: snap.senses },
        provenance: snap.provenance,
      });
    }
    console.log(`PASS  fixtures/ngram/${file} — ${parsed.data.length} bucket row(s) queued`);
  }

  const wiktionaryFiles = await fs.readdir(path.join(root, "wiktionary")).catch(() => [] as string[]);
  for (const file of wiktionaryFiles.filter((f) => f.endsWith(".json"))) {
    const parsed = TermSnapshotSchema.safeParse(await readJson(path.join("wiktionary", file)));
    if (!parsed.success) {
      console.error(`FAIL  fixtures/wiktionary/${file} failed TermSnapshot validation — skipped`);
      failures++;
      continue;
    }
    const snap = parsed.data;
    rows.push({
      term: snap.term,
      year_bucket: snap.yearBucket,
      data: { relFreq: snap.relFreq, senses: snap.senses },
      provenance: snap.provenance,
    });
    console.log(`PASS  fixtures/wiktionary/${file} — etymology row queued`);
  }

  if (rows.length === 0) {
    console.error("FAIL  no valid term_snapshots rows to seed");
    return 1;
  }

  const { error } = await client.from("term_snapshots").upsert(rows, { onConflict: "term,year_bucket" });
  if (error) {
    console.error(`FAIL  term_snapshots upsert: ${error.message}`);
    return 1;
  }
  console.log(`\nupserted ${rows.length} term_snapshots row(s) across ${new Set(rows.map((r) => r.term)).size} term(s)`);
  return failures === 0 ? 0 : 1;
}

async function main(): Promise<void> {
  if (process.argv.includes("--check")) {
    process.exitCode = await check();
    return;
  }
  if (process.argv.includes("--seed")) {
    process.exitCode = await seed();
    return;
  }
  console.error("usage: node scripts/seed-fixtures.ts --check | --seed");
  process.exitCode = 2;
}

void main();
