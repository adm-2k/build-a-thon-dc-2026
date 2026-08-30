/**
 * app/scriptorium/ocr-client.ts — browser-side calls to this app's own
 * /api/ocr and /api/documents routes (NOT a raw external fetch — CLAUDE.md
 * eng rule 2 governs server-to-external calls inside lib/engine/; a page
 * calling its own Next.js API route is the normal client/server split).
 *
 * OcrResult now comes from lib/engine/schemas.ts (Lane A merged it 2026-08-30
 * — was a local LACUNA(lane-tracer)-marked mirror before that, verified
 * identical to the real schema on landing).
 *
 * POST /api/ocr landed 2026-08-30 (#14, hfVision ladder) — live-verified
 * from this worktree: keyless/fixture mode with no fixtures/ocr/ yet (Lane D
 * in flight) answers 200 with a typed lacuna envelope
 * (`{"dep":"ocr","reason":"no response at any rung (fixtures/ocr/default.json
 * missing)"}`), which requestTranscription() below renders as the ocrError
 * state, never a hang. No client-side changes were needed once the route
 * shipped — the request/response shapes matched what this file already sent.
 *
 * // LACUNA(lane-tracer): POST /api/documents does not exist on origin/main
 * // yet (Lane A's current item). saveToRecord() below degrades any non-2xx
 * // / malformed response to the same LACUNA shape the rest of the suite
 * // uses, so "Fix in the record" already behaves correctly the moment that
 * // route lands — the coordinator asked for a live-verify of the full
 * // Scriptorium -> save -> Tracer hand-off once it does; nothing here
 * // should need to change except deleting this note.
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

/** POST /api/ocr {imageDataUrl, model?, script?, language?} → OcrResult (SPEC §5). */
export async function requestTranscription(input: {
  imageDataUrl: string;
  model: string;
  script: ScriptOption;
  language: LanguageOption;
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
    return {
      ok: false,
      reason: "POST /api/documents is not wired into this build yet (Lane A, in progress).",
    };
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
