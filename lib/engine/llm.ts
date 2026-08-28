/**
 * lib/engine/llm.ts — gemini() and hf(): the only LLM callers.
 *
 * Pattern (DATA-CAVEATS addendum §3): Vercel AI SDK ai@7 — generateText +
 * `output: Output.object({ schema })`, reading `result.output`.
 * generateObject is deprecated; never use it. Model ids come from env
 * (GEMINI_MODEL — ruling §8 T10; HF_FORMALIZER_MODEL — addendum §4), never
 * from code.
 *
 * Caching: content-hash (sha256 of model+system+prompt+schema) → in-memory
 * map AND dep_cache. Re-running the exact demo input costs zero quota and
 * returns instantly (rehearse with the exact inputs; finals hits cache).
 *
 * Failure policy, in order:
 *   - zod/structured-output parse failure → EXACTLY ONE repair re-prompt
 *     carrying the validation error, then fall to the ladder. (A reported
 *     content-filter finishReason may really be schema incompatibility —
 *     repair path, not refusal path.)
 *   - 429 → fall to cache immediately, NO retry (never retry-storm a rate
 *     limit; free-tier RPD has no same-day rescue).
 *   - 5xx → one retry, then fall.
 *   - Ladder bottom is a typed Lacuna — never a throw to the route.
 *
 * Fixture mode (DEP_GEMINI_MODE / DEP_HF_MODE = fixture): canned responses
 * from fixtures/<dep>/<slug>.json, zero network, zero keys.
 */
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { env, depMode } from "../env";
import { readDepCache, writeDepCache } from "../db";
import {
  DEP_TIMEOUT_MS,
  makeLacuna,
  readFixtureWithDefault,
  sha256,
} from "./dep";
import type { DepMode, DepResult } from "./schemas";

/* ── public call shape ──────────────────────────────────────────────────── */

export interface LlmCall<T> {
  /** Output contract — FLAT shapes only (Gemini rejects z.union; z.enum ok). */
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
  /**
   * Fixture file under fixtures/gemini/ or fixtures/hf/ (without .json),
   * served when the ladder lands on fixture; falls back to default.json.
   * E.g. "extract", "stance", "formalize".
   */
  fixture?: string;
  /**
   * Gemini 3.x thinking effort (providerOptions.google.thinkingConfig).
   * Defaults to "low" — extract/judge calls must not burn thought tokens.
   */
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
  maxTokens?: number;
}

/* ── failure taxonomy ───────────────────────────────────────────────────── */

class SchemaFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaFailure";
  }
}

class HttpFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpFailure";
  }
}

function statusOf(err: unknown): number | undefined {
  let cur: unknown = err;
  for (let hop = 0; hop < 5 && cur !== null && typeof cur === "object"; hop++) {
    const e = cur as { statusCode?: unknown; status?: unknown; cause?: unknown };
    if (typeof e.statusCode === "number") return e.statusCode;
    if (typeof e.status === "number") return e.status;
    cur = e.cause;
  }
  return undefined;
}

function isParseFailure(err: unknown): boolean {
  if (err instanceof SchemaFailure) return true;
  if (NoObjectGeneratedError.isInstance(err)) return true;
  // ai@7 also surfaces NoOutputGeneratedError on Output-spec misses.
  return err instanceof Error && err.name.startsWith("AI_NoOutput");
}

function errText(err: unknown): string {
  const status = statusOf(err);
  const base =
    err instanceof Error
      ? err.name === "AbortError" || err.name === "TimeoutError"
        ? "timeout (aborted)"
        : err.message
      : String(err);
  return status !== undefined ? `HTTP ${status}: ${base}` : base;
}

/* ── content-hash caches ────────────────────────────────────────────────── */

const memoryCache = new Map<string, { data: unknown; at: string }>();

function schemaFingerprint(schema: z.ZodType<unknown>): string {
  try {
    return JSON.stringify(z.toJSONSchema(schema));
  } catch {
    return "";
  }
}

function contentHash(depName: "gemini" | "hf", call: LlmCall<unknown>): string {
  const model = depName === "gemini" ? env.GEMINI_MODEL : env.HF_FORMALIZER_MODEL;
  return sha256(
    JSON.stringify({
      dep: depName,
      model,
      system: call.system ?? "",
      prompt: call.prompt,
      schema: schemaFingerprint(call.schema),
    }),
  );
}

/* ── shared runner: cache → live (policy) → dep_cache → fixture → Lacuna ── */

type Invoke = (prompt: string, signal: AbortSignal) => Promise<unknown>;

function promptWith(call: LlmCall<unknown>, repair?: string): string {
  if (!repair) return call.prompt;
  return `${call.prompt}\n\nYour previous response failed schema validation with this error:\n${repair}\n\nReturn ONLY a corrected response that satisfies the schema exactly. No prose.`;
}

async function runLlm<T>(
  depName: "gemini" | "hf",
  call: LlmCall<T>,
  invoke: Invoke,
): Promise<DepResult<T>> {
  const mode = depMode(depName);
  const key = contentHash(depName, call);
  const lacunaKey = `${call.fixture ?? "default"}#${key.slice(0, 12)}`;
  const tried: DepMode[] = [];

  const parse = (payload: unknown): T | undefined => {
    const parsed = call.schema.safeParse(payload);
    return parsed.success ? parsed.data : undefined;
  };

  /* fixture mode: canned response, zero network, zero keys */
  if (mode === "fixture") {
    return serveFixture(depName, call, lacunaKey, tried, parse);
  }

  /* content-hash cache, both modes: in-memory first, then dep_cache */
  const hit = memoryCache.get(key);
  if (hit) {
    const data = parse(hit.data);
    if (data !== undefined)
      return { ok: true, data, mode: "cached", fetchedAt: hit.at };
  }
  tried.push("cached");
  const row = await readDepCache(depName, key);
  if (row) {
    const data = parse(row.payload);
    if (data !== undefined) {
      memoryCache.set(key, { data, at: row.fetched_at });
      return { ok: true, data, mode: "cached", fetchedAt: row.fetched_at };
    }
  }

  /* live call under the failure policy */
  if (mode === "live") {
    tried.push("live");
    try {
      const data = await callWithPolicy(depName, call, invoke);
      const at = new Date().toISOString();
      memoryCache.set(key, { data, at });
      await writeDepCache(depName, key, data); // no-ops keylessly, never throws
      return { ok: true, data, mode: "live" };
    } catch (err) {
      console.warn(
        `[llm:${depName}] live failed (${errText(err)}) — falling to fixture`,
      );
    }
  } else {
    console.warn(`[llm:${depName}] cached miss — falling to fixture`);
  }

  return serveFixture(depName, call, lacunaKey, tried, parse);
}

async function serveFixture<T>(
  depName: "gemini" | "hf",
  call: LlmCall<T>,
  lacunaKey: string,
  tried: DepMode[],
  parse: (payload: unknown) => T | undefined,
): Promise<DepResult<T>> {
  tried.push("fixture");
  const slug = call.fixture ?? "default";
  const fixture = await readFixtureWithDefault(depName, slug);
  if (fixture !== undefined) {
    const data = parse(fixture);
    if (data !== undefined) return { ok: true, data, mode: "fixture" };
    console.warn(`[llm:${depName}] fixture ${slug} failed schema — LACUNA`);
    return makeLacuna(
      depName,
      lacunaKey,
      `fixture ${slug} failed schema validation`,
      tried,
    );
  }
  console.warn(`[llm:${depName}] fixture miss (${slug}) — LACUNA`);
  return makeLacuna(
    depName,
    lacunaKey,
    `no response at any rung (fixtures/${depName}/${slug}.json missing)`,
    tried,
  );
}

/**
 * One attempt = timeout-bounded invoke + zod parse. Policy around it:
 * parse failure → exactly one repair re-prompt; 429 → rethrow (fall to
 * ladder, no retry); 5xx → one plain retry; anything else → rethrow.
 */
async function callWithPolicy<T>(
  depName: "gemini" | "hf",
  call: LlmCall<T>,
  invoke: Invoke,
): Promise<T> {
  const attempt = async (repair?: string): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEP_TIMEOUT_MS[depName]);
    try {
      const raw = await invoke(promptWith(call, repair), controller.signal);
      const parsed = call.schema.safeParse(raw);
      if (!parsed.success) throw new SchemaFailure(z.prettifyError(parsed.error));
      return parsed.data;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await attempt();
  } catch (err) {
    if (isParseFailure(err)) {
      console.warn(`[llm:${depName}] parse failed — one repair re-prompt`);
      return attempt(errText(err)); // exactly one; a second failure falls out
    }
    const status = statusOf(err);
    if (status === 429) throw err; // rate limit: fall to cache, never retry
    if (status !== undefined && status >= 500) {
      console.warn(`[llm:${depName}] HTTP ${status} — one retry`);
      return attempt();
    }
    throw err;
  }
}

/* ── Gemini (primary — extraction, stance clustering, judging) ──────────── */

let googleProvider: ReturnType<typeof createGoogleGenerativeAI> | undefined;
function getGoogle() {
  googleProvider ??= createGoogleGenerativeAI({
    apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
  return googleProvider;
}

export async function gemini<T>(call: LlmCall<T>): Promise<DepResult<T>> {
  return runLlm("gemini", call, async (prompt, signal) => {
    const result = await generateText({
      model: getGoogle()(env.GEMINI_MODEL),
      system: call.system,
      prompt,
      output: Output.object({ schema: call.schema }),
      abortSignal: signal,
      maxRetries: 0, // retry policy is ours (429 vs 5xx), not the SDK's
      providerOptions: {
        google: {
          // Gemini 3.x: thinking is on by default and costs seconds —
          // pin the minimum for extract/judge (DATA-CAVEATS addendum §3).
          thinkingConfig: { thinkingLevel: call.thinkingLevel ?? "low" },
        },
      },
    });
    return result.output;
  });
}

/* ── Hugging Face (secondary — formalizer, repair passes) ───────────────── */

const HF_ROUTER_URL = "https://router.huggingface.co/v1/chat/completions";

/** Strip markdown code fences some instruct models wrap JSON in. */
function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export async function hf<T>(call: LlmCall<T>): Promise<DepResult<T>> {
  // LACUNA(lane-a): direct fetch to the OpenAI-compatible router endpoint —
  // @ai-sdk/openai-compatible is not in SPEC §1's dependency list; if A
  // approves it via HANDOFF, swap this invoke for generateText + baseURL.
  // The prompt contract stays model-agnostic (DATA-CAVEATS §4): the JSON
  // Schema rides in the system message, no provider-specific JSON mode.
  return runLlm("hf", call, async (prompt, signal) => {
    const schemaJson = schemaFingerprint(call.schema);
    const system = [
      call.system,
      `Respond with ONLY minified JSON that validates against this JSON Schema — no prose, no markdown, no code fences:\n${schemaJson}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const res = await fetch(HF_ROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.HF_FORMALIZER_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        max_tokens: call.maxTokens ?? 2048,
      }),
      signal,
    });
    if (!res.ok) {
      throw new HttpFailure(res.status, `HF router responded ${res.status}`);
    }
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.trim() === "") {
      throw new SchemaFailure("empty completion from HF router");
    }
    try {
      return JSON.parse(stripFences(text)) as unknown;
    } catch {
      throw new SchemaFailure(
        `completion was not valid JSON (starts: ${stripFences(text).slice(0, 120)})`,
      );
    }
  });
}
