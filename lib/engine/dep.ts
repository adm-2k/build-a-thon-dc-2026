/**
 * lib/engine/dep.ts — the dependency ladder (SPEC §4, the core pattern).
 *
 * Every external call goes through dep(name, key, liveFn):
 *
 *   live    → run liveFn under an AbortController timeout (per-dep values
 *             from DATA-CAVEATS); success writes through to dep_cache.
 *             Timeout/error falls to cached.
 *   cached  → read dep_cache by (dep, sha256(key)). Miss falls to fixture.
 *   fixture → read fixtures/<dep>/<slug>.json (slug = slugify(key), then
 *             "default.json"). Miss returns a typed Lacuna — NEVER a throw
 *             to the route. Fixture mode needs no DB and no keys.
 *
 * The resolved starting rung comes from lib/env.ts (ORCHESTRATION §8 T5).
 * Each descent logs a line — the Lane A smoke test reads the descent from
 * these logs.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { depMode } from "../env";
import { readDepCache, writeDepCache } from "../db";
import type { DepMode, DepName, DepResult, Lacuna } from "./schemas";

/* ── per-dependency AbortController timeouts (ms), from DATA-CAVEATS ────── */

export const DEP_TIMEOUT_MS: Record<DepName, number> = {
  search: 6_000, // DATA-CAVEATS §1
  fetch: 5_000, // DATA-CAVEATS §2
  gemini: 30_000, // §3: latency spikes happen; well inside maxDuration=60
  hf: 8_000, // DATA-CAVEATS §4
  ngram: 10_000, // harvest-time only (§5)
  wiktionary: 10_000, // harvest-time only (§6)
  // SPEC v2 §4 / ORCHESTRATION §8 T13: a live OCR call on the pinned VLM
  // took 36s for a dense page — never share timeouts across deps with
  // different physics. 50s stays inside the 60s route budget.
  ocr: 50_000,
  ner: 30_000, // SPEC v2 §4: Gemini structured output, thinkingLevel "low"
};

/* ── shared helpers (also used by llm.ts) ───────────────────────────────── */

/** Cache key hash — dep_cache primary key is (dep, sha256(key)). */
export function sha256(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Fixture filename convention, shared with Lane D's fixtures/** tree:
 * lowercase, diacritics stripped, every non-alphanumeric run → "-",
 * trimmed, capped at 80 chars. E.g. "Is nuclear power the fastest path…"
 * → "is-nuclear-power-the-fastest-path-…".
 */
export function slugify(key: string): string {
  return key
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Read fixtures/<dep>/<slug>.json; undefined on any miss (never throws). */
export async function readFixture(
  dep: DepName,
  slug: string,
): Promise<unknown | undefined> {
  const file = path.join(process.cwd(), "fixtures", dep, `${slug}.json`);
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

/** Fixture lookup with fallback: exact slug first, then default.json. */
export async function readFixtureWithDefault(
  dep: DepName,
  slug: string,
): Promise<unknown | undefined> {
  const exact = await readFixture(dep, slug);
  if (exact !== undefined) return exact;
  if (slug !== "default") return readFixture(dep, "default");
  return undefined;
}

/** Build the typed bottom-of-ladder result (returned, never thrown). */
export function makeLacuna(
  dep: DepName,
  key: string,
  reason: string,
  tried: DepMode[],
): Lacuna {
  return { ok: false, kind: "lacuna", dep, key, reason, tried };
}

function errText(err: unknown): string {
  if (err instanceof Error)
    return err.name === "AbortError" ? "timeout (aborted)" : err.message;
  return String(err);
}

/* ── the ladder ─────────────────────────────────────────────────────────── */

export interface DepOptions<T> {
  /**
   * When given, cached/fixture payloads are validated before being served;
   * an invalid payload counts as a miss and the ladder descends. (Live
   * results are the liveFn's own responsibility to shape.)
   */
  schema?: z.ZodType<T>;
  /** Override the fixture filename (defaults to slugify(key)). */
  fixtureSlug?: string;
}

export async function dep<T>(
  name: DepName,
  key: string,
  liveFn: (signal: AbortSignal) => Promise<T>,
  options: DepOptions<T> = {},
): Promise<DepResult<T>> {
  const startMode = depMode(name);
  const keyHash = sha256(key);
  const tried: DepMode[] = [];

  const validate = (payload: unknown): { ok: boolean; data: T } => {
    if (!options.schema) return { ok: true, data: payload as T };
    const parsed = options.schema.safeParse(payload);
    return parsed.success
      ? { ok: true, data: parsed.data }
      : { ok: false, data: undefined as T };
  };

  /* rung 1 — live */
  if (startMode === "live") {
    tried.push("live");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEP_TIMEOUT_MS[name]);
    try {
      const data = await liveFn(controller.signal);
      // Write-through; db.ts no-ops keylessly and never throws.
      await writeDepCache(name, keyHash, data);
      return { ok: true, data, mode: "live" };
    } catch (err) {
      console.warn(
        `[dep:${name}] live failed (${errText(err)}) — falling to cached`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /* rung 2 — cached */
  if (startMode === "live" || startMode === "cached") {
    tried.push("cached");
    const row = await readDepCache(name, keyHash);
    if (row) {
      const v = validate(row.payload);
      if (v.ok)
        return { ok: true, data: v.data, mode: "cached", fetchedAt: row.fetched_at };
      console.warn(
        `[dep:${name}] cached payload failed schema — falling to fixture`,
      );
    } else {
      console.warn(`[dep:${name}] cached miss — falling to fixture`);
    }
  }

  /* rung 3 — fixture */
  tried.push("fixture");
  const slug = options.fixtureSlug ?? slugify(key);
  const fixture = await readFixtureWithDefault(name, slug);
  if (fixture !== undefined) {
    const v = validate(fixture);
    if (v.ok) return { ok: true, data: v.data, mode: "fixture" };
    console.warn(`[dep:${name}] fixture ${slug} failed schema — LACUNA`);
    return makeLacuna(name, key, `fixture ${slug} failed schema validation`, tried);
  }

  /* bottom — typed Lacuna, never a throw */
  console.warn(`[dep:${name}] fixture miss (${slug}) — LACUNA`);
  return makeLacuna(
    name,
    key,
    `no data at any rung (fixtures/${name}/${slug}.json missing)`,
    tried,
  );
}
