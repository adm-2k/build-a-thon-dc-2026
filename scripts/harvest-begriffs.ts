/**
 * scripts/harvest-begriffs.ts — one-shot Begriffs harvest (SPEC §5, N°03).
 *
 * Lane D charter item 3, implemented for real. For each of the 5 seed terms:
 *
 *   1. Google Books ngram JSON (DATA-CAVEATS §5 + addendum §5): one fetch
 *      over the full 1500–1950 range, then sliced at century buckets
 *      1500–1900 PLUS decade buckets 1890–1950 (SPEC §5) — corpus id
 *      asserted against the allowlist {en-2019, de-2019} before every
 *      request (an invalid id silently serves a fallback corpus).
 *   2. Wiktionary etymology via the MediaWiki Action API two-step
 *      (DATA-CAVEATS addendum §6: the REST definition endpoint is
 *      English-only and de.wiktionary's REST equivalent 501s):
 *      `action=parse&prop=sections` to find the Etymology/Herkunft section,
 *      then `&section=<i>&prop=wikitext`. Unique User-Agent with contact
 *      info, courtesy sleeps between every Wikimedia request.
 *   3. Gemini repair pass reshaping the raw wikitext into TermSnapshot.senses
 *      (flat schema, thinkingLevel low, one retry on a schema-validation
 *      failure) — output still wants a human EYEBALL before it ships
 *      (DATA-CAVEATS §6: "5 terms, 2 minutes of eyeballing").
 *   4. Commit two fixture families, matching the shape already established
 *      by the scaffold's placeholders:
 *        fixtures/ngram/<slug>.json      — TermSnapshot[] (senses: [],
 *                                           one row per year bucket, real
 *                                           relFreq)
 *        fixtures/wiktionary/<slug>.json — TermSnapshot (one row, yearBucket
 *                                           2000 as the "current knowledge"
 *                                           sentinel — matches
 *                                           fixtures/wiktionary/erfahrung.json
 *                                           precedent), senses populated,
 *                                           no relFreq.
 *      DB seeding from these fixtures is scripts/seed-fixtures.ts's job
 *      (Lane D charter item 4), not this script's.
 *
 * Never wired into deployed runtime: DEP_NGRAM_MODE/DEP_WIKTIONARY_MODE are
 * `cached` (DATA-CAVEATS §5–6) — this script is the only thing that ever
 * calls either endpoint live. Run with credentials in .env.local:
 *   node --env-file=.env.local scripts/harvest-begriffs.ts
 * Needs GOOGLE_GENERATIVE_AI_API_KEY + GEMINI_MODEL; ngram/Wiktionary need no
 * keys. Without the Gemini key, senses fall back to [] with a warning — the
 * ngram fixtures still harvest fine on their own.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { generateText, Output } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { TermSenseSchema, type TermSnapshot, type TermSense } from "../lib/engine/schemas.ts";

/* ── seed terms + language ────────────────────────────────────────────── */

const SEED_TERMS: ReadonlyArray<{ term: string; lang: "en" | "de" }> = [
  { term: "Erfahrung", lang: "de" },
  { term: "Fordismus", lang: "de" },
  { term: "Rationalisierung", lang: "de" },
  { term: "experience", lang: "en" },
  { term: "rationalization", lang: "en" },
];

/** SPEC §5: century intervals 1500–1900 PLUS decade resolution 1890–1950. */
const CENTURY_BUCKETS = [1500, 1600, 1700, 1800, 1900] as const;
const DECADE_BUCKETS = [1890, 1900, 1910, 1920, 1930, 1940, 1950] as const;
const YEAR_BUCKETS = [...new Set([...CENTURY_BUCKETS, ...DECADE_BUCKETS])].sort((a, b) => a - b);
const NGRAM_YEAR_START = YEAR_BUCKETS[0]!;
const NGRAM_YEAR_END = YEAR_BUCKETS[YEAR_BUCKETS.length - 1]!;

/** The "current knowledge" sentinel row for the etymology snapshot — matches
 * the fixtures/wiktionary/erfahrung.json precedent already committed. */
const WIKTIONARY_SNAPSHOT_YEAR = 2000;

/** Silent-fallback guard (DATA-CAVEATS addendum §5): only these corpus ids. */
const CORPUS_ALLOWLIST = { en: "en-2019", de: "de-2019" } as const;
type AllowedCorpus = (typeof CORPUS_ALLOWLIST)[keyof typeof CORPUS_ALLOWLIST];

function corpusFor(lang: "en" | "de"): AllowedCorpus {
  return CORPUS_ALLOWLIST[lang];
}

function assertAllowedCorpus(id: string): asserts id is AllowedCorpus {
  const allowed: readonly string[] = Object.values(CORPUS_ALLOWLIST);
  if (!allowed.includes(id)) {
    throw new Error(
      `refusing to query ngram corpus "${id}" — not in the allowlist {${allowed.join(", ")}} ` +
        `(DATA-CAVEATS addendum §5: an invalid id silently serves a fallback corpus)`,
    );
  }
}

const COURTESY_SLEEP_MS = 2_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Required on every Wikimedia request (DATA-CAVEATS addendum §6 etiquette). */
const WIKIMEDIA_USER_AGENT =
  "Apparatus-DH-Suite/0.1 (early-20th-c. textual research buildathon tool; " +
  "contact: dev@theupskillinglabs.org)";

/* ── Google Books ngram (DATA-CAVEATS §5, addendum §5) ───────────────────── */

interface NgramSeries {
  ngram: string;
  type: string;
  timeseries: number[];
}

/** One request per term over the full bucket range; slice out each bucket
 * year locally rather than one request per bucket (kinder to a "scrape-
 * adjacent" unofficial endpoint). Returns undefined on a genuine fetch/parse
 * failure; an empty timeseries (HTTP 200, no match) yields an all-undefined
 * bucket map, per DATA-CAVEATS §5 — "never retry" either way. */
async function fetchNgramBuckets(
  term: string,
  corpus: AllowedCorpus,
): Promise<Map<number, number> | undefined> {
  assertAllowedCorpus(corpus);
  const url =
    `https://books.google.com/ngrams/json?content=${encodeURIComponent(term)}` +
    `&year_start=${NGRAM_YEAR_START}&year_end=${NGRAM_YEAR_END}&corpus=${corpus}&smoothing=0`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`  [ngram] HTTP ${res.status} for "${term}" (${corpus}) — no data`);
      return new Map();
    }
    const body = (await res.json()) as NgramSeries[];
    if (!Array.isArray(body) || body.length === 0) {
      console.warn(`  [ngram] empty result for "${term}" (${corpus}) — no data (not retrying)`);
      return new Map();
    }
    // Exact-match single-term query: take the first series.
    const series = body[0]!;
    const buckets = new Map<number, number>();
    for (const year of YEAR_BUCKETS) {
      const idx = year - NGRAM_YEAR_START;
      const value = series.timeseries[idx];
      if (typeof value === "number") buckets.set(year, value);
    }
    return buckets;
  } catch (err) {
    console.warn(`  [ngram] fetch failed for "${term}": ${err instanceof Error ? err.message : err}`);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

/* ── Wiktionary Action API two-step (DATA-CAVEATS addendum §6) ───────────── */

interface WikiSection {
  toclevel: number;
  line: string;
  index: string;
}

async function wiktionaryApi(host: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`https://${host}/w/api.php`);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": WIKIMEDIA_USER_AGENT },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/** English pages number multiple "Etymology 1"/"Etymology 2" sections when a
 * word has multiple derivations — take the first. Entries can carry other
 * languages' homograph sections too; taking the first match is the
 * documented simplification (round-2 work if a term needs language-section
 * scoping). English Wiktionary sets these as real `===Etymology===` wikitext
 * headings, so the sections API sees them. */
function findEnglishEtymologyIndex(sections: WikiSection[]): string | undefined {
  return sections.find((s) => /^Etymology\b/i.test(s.line))?.index;
}

/**
 * German Wiktionary does NOT use a real heading for etymology — it's a bare
 * `{{Herkunft}}` template call on its own line, followed by `:`-prefixed
 * content lines, with no wikitext `==`/`===` around it. That means
 * `action=parse&prop=sections` never lists it (live-verified against
 * "Erfahrung" and "Rationalisierung" while building this script — sections
 * only surfaced the real headings: the language section, the part-of-speech
 * section, and "Übersetzungen"). So for German we fetch the FULL wikitext in
 * one call and slice the block ourselves: from the `{{Herkunft}}` line to
 * the next bare `{{SomeTemplate}}` header line or `==` heading.
 */
function extractHerkunftBlock(wikitext: string): string | undefined {
  const lines = wikitext.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^\{\{Herkunft\}\}\s*$/.test(l.trim()));
  if (startIdx === -1) return undefined;
  const content: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (/^\{\{[^}|]+\}\}\s*$/.test(trimmed)) break; // next bare-template section header
    if (/^={2,}/.test(trimmed)) break; // next real heading
    content.push(line);
  }
  const block = content.join("\n").trim();
  return block.length > 0 ? block : undefined;
}

async function harvestEtymologyWikitext(term: string, lang: "en" | "de"): Promise<string | undefined> {
  const host = `${lang}.wiktionary.org`;
  try {
    if (lang === "de") {
      const full = (await wiktionaryApi(host, { action: "parse", page: term, prop: "wikitext" })) as {
        parse?: { wikitext?: { "*"?: string } };
        error?: { info?: string };
      };
      if (full.error) {
        console.warn(`  [wiktionary] ${host}/${term}: ${full.error.info ?? "error"}`);
        return undefined;
      }
      const wikitext = full.parse?.wikitext?.["*"];
      if (!wikitext) return undefined;
      const block = extractHerkunftBlock(wikitext);
      if (!block) console.warn(`  [wiktionary] no {{Herkunft}} block found for "${term}" on ${host} (genuine gap, not a fetch failure)`);
      return block;
    }

    const parsed = (await wiktionaryApi(host, { action: "parse", page: term, prop: "sections" })) as {
      parse?: { sections?: WikiSection[] };
      error?: { info?: string };
    };
    if (parsed.error) {
      console.warn(`  [wiktionary] ${host}/${term}: ${parsed.error.info ?? "error"}`);
      return undefined;
    }
    const sections = parsed.parse?.sections ?? [];
    const index = findEnglishEtymologyIndex(sections);
    if (!index) {
      console.warn(`  [wiktionary] no Etymology section found for "${term}" on ${host}`);
      return undefined;
    }
    await sleep(COURTESY_SLEEP_MS);
    const wiki = (await wiktionaryApi(host, {
      action: "parse",
      page: term,
      prop: "wikitext",
      section: index,
    })) as { parse?: { wikitext?: { "*"?: string } } };
    return wiki.parse?.wikitext?.["*"];
  } catch (err) {
    console.warn(`  [wiktionary] fetch failed for "${term}" on ${host}: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}

/* ── Gemini repair pass: wikitext → TermSnapshot.senses ──────────────────── */

const SensesSchema = z.object({ senses: z.array(TermSenseSchema) });

let googleProvider: ReturnType<typeof createGoogleGenerativeAI> | undefined;
function getGoogle() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return undefined;
  googleProvider ??= createGoogleGenerativeAI({ apiKey });
  return googleProvider;
}

function sensesPrompt(term: string, lang: "en" | "de", wikitext: string, repairError?: string): string {
  const base =
    `You are reformatting a raw Wiktionary etymology section into a clean, flat JSON shape.\n\n` +
    `Term: "${term}" (${lang === "de" ? "German" : "English"})\n` +
    `Raw wikitext (Wiktionary markup — templates like {{af|...}}, {{inh|...}}, links [[like this]]):\n` +
    `---\n${wikitext}\n---\n\n` +
    `Produce 1-3 senses. For each: a plain-English "gloss" (the meaning, or the ` +
    `etymological development if the section is purely derivational), an optional ` +
    `"firstAttested" (a century/date/language-stage mentioned in the text, e.g. ` +
    `"Middle High German", "14th century" — omit if none is stated), and a "note" ` +
    `that explains the derivation in plain prose (strip all wikitext markup and ` +
    `template syntax) and ENDS with the literal attribution string "Wiktionary, CC BY-SA 4.0."`;
  if (!repairError) return base;
  return `${base}\n\nYour previous response failed schema validation with this error:\n${repairError}\n\nReturn ONLY a corrected response.`;
}

async function repairSenses(term: string, lang: "en" | "de", wikitext: string): Promise<TermSense[]> {
  const google = getGoogle();
  if (!google) {
    console.warn(`  [gemini] GOOGLE_GENERATIVE_AI_API_KEY not set — senses left empty for "${term}"`);
    return [];
  }
  const model = google(process.env.GEMINI_MODEL ?? "gemini-3.6-flash");
  let lastError: string | undefined;
  for (const attempt of ["first", "repair"] as const) {
    try {
      const result = await generateText({
        model,
        prompt: sensesPrompt(term, lang, wikitext, attempt === "repair" ? lastError : undefined),
        output: Output.object({ schema: SensesSchema }),
        maxRetries: 0,
        providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
      });
      return result.output.senses;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === "repair") {
        console.warn(`  [gemini] repair pass failed twice for "${term}": ${lastError} — senses left empty`);
        return [];
      }
      console.warn(`  [gemini] first attempt failed for "${term}" (${lastError}) — one repair re-prompt`);
    }
  }
  return [];
}

/* ── per-term harvest ──────────────────────────────────────────────────── */

function slugify(term: string): string {
  return term.toLowerCase();
}

async function harvestTerm(
  term: string,
  lang: "en" | "de",
): Promise<{ ngramRows: TermSnapshot[]; wiktionarySnapshot: TermSnapshot }> {
  const corpus = corpusFor(lang);
  console.log(`\n=== ${term} (${lang}, corpus ${corpus}) ===`);

  console.log(`  fetching ngram ${NGRAM_YEAR_START}-${NGRAM_YEAR_END}...`);
  const buckets = await fetchNgramBuckets(term, corpus);
  await sleep(COURTESY_SLEEP_MS);

  console.log(`  fetching Wiktionary etymology from ${lang}.wiktionary.org...`);
  const wikitext = await harvestEtymologyWikitext(term, lang);

  let senses: TermSense[] = [];
  if (wikitext) {
    console.log(`  repairing wikitext (${wikitext.length} chars) into senses via Gemini...`);
    senses = await repairSenses(term, lang, wikitext);
  }

  const ngramRows: TermSnapshot[] = YEAR_BUCKETS.map((yearBucket) => ({
    term,
    yearBucket,
    relFreq: buckets?.get(yearBucket),
    senses: [],
    provenance: "cached",
  }));

  const wiktionarySnapshot: TermSnapshot = {
    term,
    yearBucket: WIKTIONARY_SNAPSHOT_YEAR,
    senses,
    provenance: "cached",
  };

  console.log(
    `  done: ${ngramRows.filter((r) => r.relFreq !== undefined).length}/${YEAR_BUCKETS.length} ` +
      `buckets have frequency data, ${senses.length} sense(s) harvested`,
  );
  return { ngramRows, wiktionarySnapshot };
}

/* ── entry point ───────────────────────────────────────────────────────── */

async function writeJson(relPath: string, data: unknown): Promise<void> {
  const full = path.join(process.cwd(), relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`  wrote ${relPath}`);
}

async function main(): Promise<void> {
  console.log(
    `harvest-begriffs: ${SEED_TERMS.length} seed terms, buckets [${YEAR_BUCKETS.join(", ")}], ` +
      `${COURTESY_SLEEP_MS}ms courtesy sleeps`,
  );

  for (const [i, { term, lang }] of SEED_TERMS.entries()) {
    const { ngramRows, wiktionarySnapshot } = await harvestTerm(term, lang);
    const slug = slugify(term);
    await writeJson(`fixtures/ngram/${slug}.json`, ngramRows);
    await writeJson(`fixtures/wiktionary/${slug}.json`, wiktionarySnapshot);
    if (i < SEED_TERMS.length - 1) await sleep(COURTESY_SLEEP_MS);
  }

  console.log(
    `\nharvest complete — EYEBALL fixtures/wiktionary/*.json before committing ` +
      `(DATA-CAVEATS §6: senses are LLM-reshaped from raw wikitext).`,
  );
}

void main();
