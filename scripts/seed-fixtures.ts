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
  LogicalFormSchema,
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

async function main(): Promise<void> {
  if (process.argv.includes("--check")) {
    process.exitCode = await check();
    return;
  }
  // LACUNA(lane-d): DB seeding not implemented — load fixtures/ngram/ +
  // fixtures/demo dep outputs into Supabase (dep_cache, term_snapshots) via a
  // direct @supabase/supabase-js client here (lib/db.ts is server-only and
  // cannot be imported from a script). Until then only --check is supported.
  console.error("seed mode not implemented yet — run with --check (see LACUNA note in this file)");
  process.exitCode = 2;
}

void main();
