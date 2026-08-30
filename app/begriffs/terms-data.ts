import { TermSnapshotSchema, type TermSnapshot } from "@/lib/engine/schemas";

// LACUNA(lane-design): GET /api/terms (Lane A charter item 8, T4) does not
// exist on origin/main yet. Until it does, this reads the harvest fixtures
// DATA-CAVEATS §5/§6 already commits as the floor "so a fresh DB can be
// seeded" — never lib/db.ts (ORCHESTRATION T4: Lane E never imports it
// directly). Swap BegriffsClient's live-fetch-first path takes priority the
// moment the route ships; delete this file's role as a fallback then, or
// keep it as the last rung if a term-not-yet-harvested case remains.
import erfahrungNgram from "@/fixtures/ngram/erfahrung.json";
import experienceNgram from "@/fixtures/ngram/experience.json";
import fordismusNgram from "@/fixtures/ngram/fordismus.json";
import rationalisierungNgram from "@/fixtures/ngram/rationalisierung.json";
import rationalizationNgram from "@/fixtures/ngram/rationalization.json";

import erfahrungWik from "@/fixtures/wiktionary/erfahrung.json";
import experienceWik from "@/fixtures/wiktionary/experience.json";
import fordismusWik from "@/fixtures/wiktionary/fordismus.json";
import rationalisierungWik from "@/fixtures/wiktionary/rationalisierung.json";
import rationalizationWik from "@/fixtures/wiktionary/rationalization.json";

/** The five seed terms Lane D harvested (SPEC v2 §5, Lane D charter item 3). */
export const SEED_TERMS = [
  "Erfahrung",
  "Fordismus",
  "Rationalisierung",
  "experience",
  "rationalization",
] as const;
export type SeedTerm = (typeof SEED_TERMS)[number];

const NGRAM_RAW: Record<SeedTerm, unknown> = {
  Erfahrung: erfahrungNgram,
  Fordismus: fordismusNgram,
  Rationalisierung: rationalisierungNgram,
  experience: experienceNgram,
  rationalization: rationalizationNgram,
};

const WIKTIONARY_RAW: Record<SeedTerm, unknown> = {
  Erfahrung: erfahrungWik,
  Fordismus: fordismusWik,
  Rationalisierung: rationalisierungWik,
  experience: experienceWik,
  rationalization: rationalizationWik,
};

function parseSnapshotRows(raw: unknown): TermSnapshot[] {
  const rows = Array.isArray(raw) ? raw : [raw];
  const out: TermSnapshot[] = [];
  for (const row of rows) {
    const parsed = TermSnapshotSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** term_snapshots-shaped rows for one seed term: ngram frequency rows plus
 * the Wiktionary etymology row, exactly the shape GET /api/terms will
 * eventually return (TermSnapshot[]) — zod-validated, never redeclared. */
export function fixtureSnapshotsFor(term: SeedTerm): TermSnapshot[] {
  return [...parseSnapshotRows(NGRAM_RAW[term]), ...parseSnapshotRows(WIKTIONARY_RAW[term])];
}
