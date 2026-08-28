/**
 * scripts/harvest-begriffs.ts — one-shot Begriffs harvest (SPEC §5, N°03).
 *
 * TYPED STUB (Phase 0 scaffold). The real harvest is Lane D charter item 4:
 *   for each seed term —
 *     1. Google Books ngram JSON (DATA-CAVEATS §5): century buckets
 *        1500–1900 plus 1950/2000; corpus id MUST be asserted against the
 *        allowlist below — an invalid id silently serves a fallback corpus.
 *     2. Wiktionary etymology via the MediaWiki Action API two-step
 *        (DATA-CAVEATS addendum §6: REST definition endpoint is
 *        English-only; de.wiktionary REST returns 501), with a unique
 *        User-Agent carrying contact info on every request.
 *     3. LLM repair pass reshaping the wikitext into TermSnapshot.senses —
 *        then a human EYEBALLS the output before it is committed.
 *     4. Write rows to term_snapshots AND commit the output to
 *        fixtures/ngram/ so a fresh DB can be reseeded.
 *   2s sleep between terms — both endpoints are rate-limit-hostile.
 *
 * Never wired into deployed runtime: modes for ngram/wiktionary are cached
 * (DATA-CAVEATS §5–6) — this script is the only thing that ever calls live.
 */
import process from "node:process";
import type { TermSnapshot } from "../lib/engine/schemas.ts";

const SEED_TERMS = [
  "Erfahrung",
  "Fordismus",
  "Rationalisierung",
  "experience",
  "rationalization",
] as const;

const YEAR_BUCKETS = [1500, 1600, 1700, 1800, 1900, 1950, 2000] as const;

/** Silent-fallback guard (DATA-CAVEATS addendum §5): only these corpus ids. */
const CORPUS_ALLOWLIST = { en: "en-2019", de: "de-2019" } as const;

const SLEEP_BETWEEN_TERMS_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function corpusFor(term: string): string {
  // German seed terms are capitalized nouns; the English pair is lowercase.
  return term[0] === term[0]?.toUpperCase() ? CORPUS_ALLOWLIST.de : CORPUS_ALLOWLIST.en;
}

// LACUNA(lane-d): implement the harvest per the header plan — this stub only
// walks the schedule to prove types and etiquette. No rows are written.
async function harvestTerm(term: string): Promise<TermSnapshot[]> {
  console.log(`  would harvest "${term}" (corpus ${corpusFor(term)}, buckets ${YEAR_BUCKETS.join("/")})`);
  return [];
}

async function main(): Promise<void> {
  console.log(`harvest-begriffs: ${SEED_TERMS.length} seed terms, 2s courtesy sleeps\n`);
  const rows: TermSnapshot[] = [];
  for (const [i, term] of SEED_TERMS.entries()) {
    rows.push(...(await harvestTerm(term)));
    if (i < SEED_TERMS.length - 1) await sleep(SLEEP_BETWEEN_TERMS_MS);
  }
  console.log(`\nSTUB — ${rows.length} rows written. The harvest is Lane D charter item 4;`);
  console.log("see the LACUNA note in this file. Exiting non-zero so nothing mistakes this for a run.");
  process.exitCode = 1;
}

void main();
