/**
 * app/scriptorium/ocr-client.ts — browser-side calls to this app's own
 * /api/ocr and /api/documents routes (NOT a raw external fetch — CLAUDE.md
 * eng rule 2 governs server-to-external calls inside lib/engine/; a page
 * calling its own Next.js API route is the normal client/server split).
 *
 * Both routes are live on main: POST /api/ocr (#14, hfVision ladder; #19
 * added the `fixture` slug param requestTranscription() sends) and
 * GET+POST /api/documents (#17). OcrResult imports from
 * lib/engine/schemas.ts rather than a local mirror. Every response follows
 * the app-wide envelope (`{ data, mode?, fetchedAt? }` on success,
 * `{ data: null, lacuna: { dep, reason } }` at the ladder's bottom); both
 * requestTranscription() and saveToRecord() below degrade any non-2xx or
 * malformed response to that same shape, so a route regression or a
 * keyless/no-Supabase environment renders an honest ocrError/saveError
 * state, never a hang. Live-verified 2026-08-30: keyless POST /api/ocr with
 * no fixture serves fixtures/ocr/default.json's real text; POST
 * /api/documents keyless answers a typed `db` lacuna ("Supabase is not
 * configured..."), matching CLAUDE.md eng rule 5.
 */
import { OcrResultSchema, type OcrResult } from "@/lib/engine/schemas";
import type { LanguageOption, ScriptOption } from "./registry";

export type { OcrResult };

export type DepMode = "live" | "cached" | "fixture";

export type OcrOutcome =
  | { ok: true; data: OcrResult; mode: DepMode; fetchedAt?: string }
  | { ok: false; reason: string };

export type SaveOutcome =
  | { ok: true; documentId: string }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function coerceOcrResult(data: unknown, fallbackDocumentId: string): OcrResult | null {
  if (!isRecord(data)) return null;
  // The server should already stamp documentId, but fall back to a
  // client-generated one so a still-in-progress /api/ocr (missing that
  // field) doesn't fail validation solely on it.
  const withFallbackId = { documentId: fallbackDocumentId, ...data };
  const parsed = OcrResultSchema.safeParse(withFallbackId);
  return parsed.success ? parsed.data : null;
}

async function parseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * POST /api/ocr {imageDataUrl, model?, script?, language?, fixture?} →
 * OcrResult (SPEC §5). `fixture` (added #19, 2026-08-30) names one of the
 * real corpus fixtures under fixtures/ocr/ to serve when the ladder falls
 * to its floor — DEMO_FIXTURES in ./registry lists the choices.
 */
export async function requestTranscription(input: {
  imageDataUrl: string;
  model: string;
  script: ScriptOption;
  language: LanguageOption;
  fixture?: string;
}): Promise<OcrOutcome> {
  let res: Response;
  try {
    res = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, reason: "Could not reach the OCR route (network error)." };
  }

  const json = await parseJson(res);

  if (res.status === 404) {
    // Defensive fallback only — POST /api/ocr has been live since #14.
    return { ok: false, reason: "The OCR route could not be found (HTTP 404)." };
  }
  if (!res.ok) {
    const message =
      isRecord(json) && Array.isArray(json.issues) && json.issues[0] && isRecord(json.issues[0])
        ? readString(json.issues[0].message)
        : undefined;
    return { ok: false, reason: message ?? `The OCR route answered HTTP ${res.status}.` };
  }
  if (isRecord(json) && json.lacuna) {
    const reason = isRecord(json.lacuna) ? readString(json.lacuna.reason) : undefined;
    return { ok: false, reason: reason ?? "The OCR ladder bottomed out." };
  }

  const provisionalId = crypto.randomUUID();
  const result = coerceOcrResult(isRecord(json) ? json.data : null, provisionalId);
  if (!result) {
    return { ok: false, reason: "The OCR response did not match the expected shape." };
  }
  const mode: DepMode = isRecord(json) && (json.mode === "live" || json.mode === "cached") ? json.mode : "fixture";
  const fetchedAt = isRecord(json) ? readString(json.fetchedAt) : undefined;
  return { ok: true, data: result, mode, fetchedAt };
}

/**
 * POST /api/documents — write the (possibly edited) transcription to the
 * corpus (SPEC §3b: raw_text = transcription, source_url = image
 * provenance, tool = "scriptorium").
 */
export async function saveToRecord(input: {
  documentId: string;
  text: string;
  sourceUrl: string;
  model: string;
  script: ScriptOption;
  language: LanguageOption;
}): Promise<SaveOutcome> {
  let res: Response;
  try {
    res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        sourceUrl: input.sourceUrl,
        tool: "scriptorium",
        ocr: { model: input.model, script: input.script, language: input.language },
      }),
    });
  } catch {
    return { ok: false, reason: "Could not reach the corpus route (network error)." };
  }

  const json = await parseJson(res);

  if (res.status === 404) {
    // Defensive fallback only — POST /api/documents has been live since #17.
    return { ok: false, reason: "The corpus route could not be found (HTTP 404)." };
  }
  if (!res.ok) {
    return { ok: false, reason: `The corpus route answered HTTP ${res.status}.` };
  }
  if (isRecord(json) && json.lacuna) {
    const reason = isRecord(json.lacuna) ? readString(json.lacuna.reason) : undefined;
    return { ok: false, reason: reason ?? "The corpus write bottomed out." };
  }

  const data = isRecord(json) ? json.data : null;
  const documentId = isRecord(data) ? readString(data.id) ?? readString(data.documentId) : undefined;
  if (!documentId) {
    return { ok: false, reason: "The corpus response did not include a document id." };
  }
  return { ok: true, documentId };
}
