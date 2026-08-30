/**
 * lib/env.ts — zod-validated environment, resolved once at boot.
 *
 * SECRETS RULE (CLAUDE.md engineering rule 7): every secret is read here and
 * only here. Never log a key; never read process.env for credentials
 * anywhere else.
 *
 * MODE RESOLUTION (ORCHESTRATION §8 T5 — supersedes SPEC §4's bare
 * default-live):
 *   1. An explicit DEP_<X>_MODE value always wins.
 *   2. An UNSET mode resolves to "live" when the dep's credential is
 *      present, and to "fixture" when it is absent.
 *   3. A dep with no credential of its own (fetch, ngram, wiktionary)
 *      resolves to "fixture" when unset — production sets every mode
 *      explicitly anyway (SPEC §7), so deployed behavior is unchanged.
 *
 * FAIL-LOUDLY CONTRACT: boot throws only when a RESOLVED mode cannot work —
 * i.e. an explicit "live" mode whose credential is missing. "cached" without
 * Supabase does NOT fail: dep_cache reads miss and the ladder falls to
 * fixture (that keeps `cp .env.example .env.local` working for the keyless
 * UI lanes). With NO env file at all, every mode resolves to fixture and
 * boot always succeeds.
 */
import { z } from "zod";
import {
  DEP_NAMES,
  DepModeSchema,
  type DepMode,
  type DepName,
} from "./engine/schemas";

/* ── raw parsing ───────────────────────────────────────────────────────── */

/** `.env` files routinely contain `VAR=` — treat empty/whitespace as unset. */
const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const optionalSecret = z.preprocess(emptyToUndef, z.string().min(1).optional());
const modeVar = z.preprocess(emptyToUndef, DepModeSchema.optional());

const RawEnvSchema = z.object({
  // LLM primary — Google AI Studio (Gemini)
  GOOGLE_GENERATIVE_AI_API_KEY: optionalSecret,
  // Model id pinned in env, not code (ORCHESTRATION §8 T10:
  // gemini-2.5-flash is closed to new users; fallback string gemini-3.5-flash;
  // never gemini-3.7-flash).
  GEMINI_MODEL: z.preprocess(
    emptyToUndef,
    z.string().min(1).default("gemini-3.6-flash"),
  ),

  // Database — Supabase (server-only; see lib/db.ts)
  SUPABASE_URL: z.preprocess(emptyToUndef, z.url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,

  // LLM secondary — Hugging Face Inference Providers router
  HF_TOKEN: optionalSecret,
  // Formalizer pin (DATA-CAVEATS addendum §4) — swap via env, never code.
  HF_FORMALIZER_MODEL: z.preprocess(
    emptyToUndef,
    z.string().min(1).default("Qwen/Qwen3-4B-Instruct-2507:nscale"),
  ),
  // OCR vision model pin (SPEC v2 §7 / DATA-CAVEATS addendum 2 §10) —
  // overridable per request; swapping the default is a string change here,
  // never a code change.
  HF_OCR_MODEL: z.preprocess(
    emptyToUndef,
    z.string().min(1).default("Qwen/Qwen3-VL-30B-A3B-Instruct"),
  ),

  // Web search — Tavily primary, Brave fallback (ORCHESTRATION §8 T9)
  SEARCH_API_KEY: optionalSecret,
  SEARCH_PROVIDER: z.preprocess(
    emptyToUndef,
    z.enum(["tavily", "brave"]).default("tavily"),
  ),

  // Dependency ladder modes (all eight are part of the contract, incl.
  // gemini and the SPEC v2 ocr/ner rungs — SPEC §4).
  DEP_SEARCH_MODE: modeVar,
  DEP_FETCH_MODE: modeVar,
  DEP_GEMINI_MODE: modeVar,
  DEP_NGRAM_MODE: modeVar,
  DEP_WIKTIONARY_MODE: modeVar,
  DEP_HF_MODE: modeVar,
  DEP_OCR_MODE: modeVar,
  DEP_NER_MODE: modeVar,
});

type RawEnv = z.infer<typeof RawEnvSchema>;

/* ── resolution ────────────────────────────────────────────────────────── */

/** Which credential gates each dep's implicit-live resolution (T5 rule 2–3). */
const CREDENTIAL_FOR: Record<
  DepName,
  "SEARCH_API_KEY" | "GOOGLE_GENERATIVE_AI_API_KEY" | "HF_TOKEN" | null
> = {
  search: "SEARCH_API_KEY",
  gemini: "GOOGLE_GENERATIVE_AI_API_KEY",
  hf: "HF_TOKEN",
  fetch: null, // plain HTTP — keyless; explicit DEP_FETCH_MODE=live in prod
  ngram: null, // harvest-time only; never live in deployed code
  wiktionary: null, // harvest-time only; never live in deployed code
  // ocr's primary rung is the HF router vision call (SPEC v2 §4); Gemini
  // vision is the fallback rung INSIDE live, not a separate mode gate.
  ocr: "HF_TOKEN",
  // ner's primary rung is Gemini structured output (SPEC v2 §4).
  ner: "GOOGLE_GENERATIVE_AI_API_KEY",
};

const MODE_VAR_FOR: Record<DepName, keyof RawEnv> = {
  search: "DEP_SEARCH_MODE",
  fetch: "DEP_FETCH_MODE",
  gemini: "DEP_GEMINI_MODE",
  hf: "DEP_HF_MODE",
  ngram: "DEP_NGRAM_MODE",
  wiktionary: "DEP_WIKTIONARY_MODE",
  ocr: "DEP_OCR_MODE",
  ner: "DEP_NER_MODE",
};

export interface Env {
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  GEMINI_MODEL: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  HF_TOKEN?: string;
  HF_FORMALIZER_MODEL: string;
  HF_OCR_MODEL: string;
  SEARCH_API_KEY?: string;
  SEARCH_PROVIDER: "tavily" | "brave";
  /** Resolved (never undefined) mode per dependency, per the T5 ruling. */
  modes: Record<DepName, DepMode>;
  /** True when both Supabase vars are present — db.ts helpers no-op otherwise. */
  supabaseConfigured: boolean;
}

function loadEnv(): Env {
  const parsed = RawEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // z.prettifyError names offending vars but never prints values.
    throw new Error(
      `[env] boot validation failed:\n${z.prettifyError(parsed.error)}`,
    );
  }
  const raw = parsed.data;

  const modes = {} as Record<DepName, DepMode>;
  const failures: string[] = [];

  for (const dep of DEP_NAMES) {
    const explicit = raw[MODE_VAR_FOR[dep]] as DepMode | undefined;
    const credName = CREDENTIAL_FOR[dep];
    const credPresent = credName !== null && raw[credName] !== undefined;

    const resolved: DepMode = explicit ?? (credPresent ? "live" : "fixture");
    modes[dep] = resolved;

    // Fail loudly only when a RESOLVED live mode lacks its key. (Only an
    // explicit "live" can reach this state — implicit live implies the
    // credential is present.)
    if (resolved === "live" && credName !== null && !credPresent) {
      failures.push(
        `${MODE_VAR_FOR[dep]}=live but ${credName} is unset — set the key or drop the mode override`,
      );
    }
  }

  const supabaseConfigured =
    raw.SUPABASE_URL !== undefined &&
    raw.SUPABASE_SERVICE_ROLE_KEY !== undefined;

  if (failures.length > 0) {
    throw new Error(
      `[env] boot validation failed:\n  - ${failures.join("\n  - ")}`,
    );
  }

  // Warn (once, at boot) where cached mode will degrade: without Supabase,
  // dep_cache reads miss and the ladder lands on fixture. A state, not a crash.
  if (!supabaseConfigured) {
    const cachedDeps = DEP_NAMES.filter((d) => modes[d] === "cached");
    if (cachedDeps.length > 0) {
      console.warn(
        `[env] ${cachedDeps.join(", ")} resolved to cached but Supabase is not configured — dep_cache reads will miss and fall to fixture`,
      );
    }
  }

  return {
    GOOGLE_GENERATIVE_AI_API_KEY: raw.GOOGLE_GENERATIVE_AI_API_KEY,
    GEMINI_MODEL: raw.GEMINI_MODEL,
    SUPABASE_URL: raw.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: raw.SUPABASE_SERVICE_ROLE_KEY,
    HF_TOKEN: raw.HF_TOKEN,
    HF_FORMALIZER_MODEL: raw.HF_FORMALIZER_MODEL,
    HF_OCR_MODEL: raw.HF_OCR_MODEL,
    SEARCH_API_KEY: raw.SEARCH_API_KEY,
    SEARCH_PROVIDER: raw.SEARCH_PROVIDER,
    modes,
    supabaseConfigured,
  };
}

/** Validated once at first import — importing this module IS the boot check. */
export const env: Env = loadEnv();

/** Resolved ladder mode for one dependency (ORCHESTRATION §8 T5). */
export function depMode(name: DepName): DepMode {
  return env.modes[name];
}
