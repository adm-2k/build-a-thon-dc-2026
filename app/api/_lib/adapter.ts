/**
 * app/api/_lib/adapter.ts — the single seam between route handlers and the engine.
 *
 * Routes never fetch and never import provider SDKs (CLAUDE.md eng rule 2):
 * every external call goes through lib/engine/dep.ts's ladder (SPEC §4), every
 * LLM call through lib/engine/llm.ts, every DB touch through lib/db.ts. This
 * file is the only place app/api/** binds to those modules' function surface,
 * so any signature drift between the parallel scaffold groups is reconciled
 * HERE, in one file — the six routes only depend on this seam.
 *
 * ASSUMED ENGINE SURFACE (from SPEC §2/§4 and the Phase 0 ENGINE charter):
 *   lib/engine/dep.ts   dep(name, key, liveFn) → Promise<{ data, mode, fetchedAt? }>
 *                       (a fixture miss surfaces as a thrown error or a returned
 *                       typed Lacuna; runDep() normalizes both into DepOutcome)
 *   lib/engine/llm.ts   gemini({ system?, prompt, schema, thinkingLevel? }) → Promise<T>
 *                       hf({ system?, prompt, schema }) → Promise<T>
 *                       (content-hash cache + one repair pass live inside llm.ts)
 *   lib/db.ts           an event insert helper (insertEvent) and an event list
 *                       helper (listEvents) — resolved by runtime feature
 *                       detection below because db.ts's helper names are not
 *                       SPEC-anchored; both no-op when Supabase vars are absent
 *   lib/env.ts          the resolved DEP_<X>_MODE map per ORCHESTRATION §8 T5
 *                       (explicit mode wins; unset+key → live; unset+keyless →
 *                       fixture) — resolved by feature detection below
 */
import { createHash } from "node:crypto";
import { dep } from "@/lib/engine/dep";
import * as dbModule from "@/lib/db";
import * as envModule from "@/lib/env";
import {
  DepModeSchema,
  TickerEventSchema,
  type DepMode,
  type TickerEvent,
} from "@/lib/engine/schemas";

/* ------------------------------------------------------------------ guards */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* ------------------------------------------------------------- small utils */

/** Stable short content hash for dep()/llm cache keys and fixture slugs. */
export function contentHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/** Search cache keys are normalized (DATA-CAVEATS §1: "keyed on normalized query"). */
export function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trim();
}

/* -------------------------------------------------------- dependency ladder */

export type DepName = "search" | "fetch" | "gemini" | "hf" | "ngram" | "wiktionary";

export type DepOutcome =
  | { ok: true; data: unknown; mode: DepMode; fetchedAt?: string }
  | { ok: false; lacuna: { dep: string; reason: string } };

function lacunaReason(result: unknown): string {
  if (isRecord(result)) {
    for (const key of ["reason", "message", "error"]) {
      const v = result[key];
      if (typeof v === "string" && v.length > 0) return v;
    }
    if (isRecord(result.lacuna)) {
      const r = result.lacuna.reason;
      if (typeof r === "string" && r.length > 0) return r;
    }
  }
  return "no live result, no cache row, no fixture (SPEC §4 ladder exhausted)";
}

/**
 * Run one dependency through the SPEC §4 ladder and normalize the outcome.
 * dep() may signal a total miss by throwing or by returning a typed Lacuna
 * value; either way the route receives a state, never an exception
 * (CLAUDE.md eng rule 5).
 */
export async function runDep(
  name: DepName,
  key: string,
  liveFn: () => Promise<unknown>,
): Promise<DepOutcome> {
  try {
    const result: unknown = await dep(name, key, liveFn);
    if (isRecord(result)) {
      const mode = DepModeSchema.safeParse(result.mode);
      if (mode.success && result.data !== undefined && result.data !== null) {
        return {
          ok: true,
          data: result.data,
          mode: mode.data,
          fetchedAt: typeof result.fetchedAt === "string" ? result.fetchedAt : undefined,
        };
      }
    }
    return { ok: false, lacuna: { dep: name, reason: lacunaReason(result) } };
  } catch (err) {
    return {
      ok: false,
      lacuna: {
        dep: name,
        reason: err instanceof Error ? err.message : `${name} unavailable`,
      },
    };
  }
}

/* -------------------------------------------------------------- LLM results */

/**
 * gemini()/hf() in lib/engine/llm.ts run their OWN internal ladder (fixture /
 * content-hash cache / live-with-repair) and resolve to a DepResult<T> — so
 * routes call them directly and normalize here; wrapping them in dep() would
 * double-ladder and cache a DepResult envelope instead of the payload.
 */
export function llmOutcome<T>(
  result:
    | { ok: true; data: T; mode: DepMode; fetchedAt?: string }
    | { ok: false; dep: string; reason: string },
): DepOutcome {
  if (result.ok) {
    return { ok: true, data: result.data, mode: result.mode, fetchedAt: result.fetchedAt };
  }
  return { ok: false, lacuna: { dep: result.dep, reason: result.reason } };
}

/**
 * Scaffold placeholder for deps whose live clients belong in lib/engine/
 * (search, fetch): routes may not fetch, so until Lane A wires the liveFn the
 * ladder simply falls live → cached → fixture. In fixture mode this function
 * is never invoked.
 */
export function notWiredLive(depName: DepName): () => Promise<never> {
  return () =>
    Promise.reject(
      new Error(
        `LACUNA(routes): live ${depName} client not wired at scaffold time — implement the liveFn in lib/engine/ (routes may not fetch)`,
      ),
    );
}

/* ------------------------------------------------------------ event helpers */

/** Build a schema-valid TickerEvent from client/pipeline input; the server stamps `at`. */
export function stampEvent(input: {
  instrument: TickerEvent["instrument"];
  verb: string;
  count?: number;
}): TickerEvent | null {
  const parsed = TickerEventSchema.safeParse({ ...input, at: new Date().toISOString() });
  return parsed.success ? parsed.data : null;
}

const INSERT_CANDIDATES = ["insertEvent", "addEvent", "createEvent"] as const;
const LIST_CANDIDATES = [
  "listRecentEvents", // lib/db.ts's actual helper name
  "listEvents",
  "latestEvents",
  "getEvents",
] as const;

/**
 * Insert one events row through lib/db.ts (feature-detected helper name).
 * Best-effort by design: db.ts no-ops keyless, and a failed ticker write must
 * never fail a pipeline response. Returns false when nothing was written.
 */
export async function insertEventRow(event: TickerEvent): Promise<boolean> {
  const mod = dbModule as unknown as Record<string, unknown>;
  for (const name of INSERT_CANDIDATES) {
    const fn = mod[name];
    if (typeof fn === "function") {
      try {
        await (fn as (e: TickerEvent) => Promise<unknown>)(event);
        return true;
      } catch (err) {
        console.warn(
          `lib/db.ts ${name}() failed — ticker write dropped:`,
          err instanceof Error ? err.message : err,
        );
        return false;
      }
    }
  }
  console.warn(
    "LACUNA(routes): lib/db.ts exposes no event insert helper (expected insertEvent) — ticker write dropped",
  );
  return false;
}

/** Read the latest ticker rows through lib/db.ts; [] on any miss (keyless mode). */
export async function latestEvents(limit = 20): Promise<unknown> {
  const mod = dbModule as unknown as Record<string, unknown>;
  for (const name of LIST_CANDIDATES) {
    const fn = mod[name];
    if (typeof fn === "function") {
      try {
        return await (fn as (limit?: number) => Promise<unknown>)(limit);
      } catch (err) {
        console.warn(
          `lib/db.ts ${name}() failed — ticker reads empty:`,
          err instanceof Error ? err.message : err,
        );
        return [];
      }
    }
  }
  console.warn(
    "LACUNA(routes): lib/db.ts exposes no event list helper (expected listEvents) — ticker reads empty",
  );
  return [];
}

/** Pipeline-completion ticker write (SPEC §5) — fire, validate, tolerate failure. */
export async function recordEvent(
  instrument: TickerEvent["instrument"],
  verb: string,
  count?: number,
): Promise<void> {
  const event = stampEvent({ instrument, verb, ...(count !== undefined ? { count } : {}) });
  if (event) await insertEventRow(event);
}

/* -------------------------------------------------------------- env / modes */

const MODE_EXPORT_CANDIDATES = ["depModes", "resolvedDepModes", "depModeMap", "modes"] as const;

/**
 * The resolved DEP_<X>_MODE map from lib/env.ts (ruling §8 T5), however that
 * module names its export. /api/health zod-parses whatever comes back, so a
 * shape mismatch degrades to an empty map — never a crash.
 */
export function resolvedDepModes(): unknown {
  const mod = envModule as unknown as Record<string, unknown>;
  for (const name of MODE_EXPORT_CANDIDATES) {
    const candidate = mod[name];
    if (typeof candidate === "function") {
      try {
        return (candidate as () => unknown)();
      } catch {
        return null;
      }
    }
    if (candidate !== undefined) return candidate;
  }
  const env = mod.env;
  if (isRecord(env)) {
    for (const name of MODE_EXPORT_CANDIDATES) {
      if (env[name] !== undefined) return env[name];
    }
  }
  return null;
}
