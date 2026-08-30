/**
 * POST /api/ocr — page image → OcrResult (SPEC v2 §5, N°00 Scriptorium).
 *
 * Runs the image through hfVision()'s own ladder (HF vision primary,
 * Gemini-vision fallback rung inside live, then cached/fixture/lacuna —
 * DATA-CAVEATS addendum 2 §10). The prompt varies by the script/language
 * hints (Scriptorium's toggles); when a hint is given it also wins over the
 * model's own determination in the final result (coerceOcrResult).
 *
 * documentId is a fresh correlation id per call, same pattern as
 * /api/extract — NOT a persisted `documents` row. Persisting happens at
 * "Fix in the record" (POST /api/documents, next charter item).
 *
 * Answers in fixture mode with no keys when the caller names a corpus slug
 * (`fixture`, e.g. "eb1911-rationalism" — fixtures/ocr/*.json, Lane D's
 * charter item 1); an unnamed request correctly bottoms out at a typed
 * LACUNA rather than silently substituting an unrelated demo page.
 */
import { hfVision } from "@/lib/engine/llm";
import {
  badRequest,
  guard,
  invalidJson,
  lacuna,
  ok,
  readJson,
  zodIssues,
} from "../_lib/respond";
import { coerceOcrResult, OcrRequestSchema, OcrWire } from "../_lib/wire";

export const maxDuration = 60;

const SYSTEM = `You are the transcription apparatus of a scholarly digitization
tool (Scriptorium), reading a page of an early-20th-century source.
Transcribe the page EXACTLY as printed or written — preserve original
spelling, punctuation, and line/paragraph structure; do not modernize,
correct, or silently expand abbreviations. Return:
- "text": the full transcription.
- "script": "print" or "handwriting" — the dominant script on the page.
- "language": "en" (English), "de" (German), or "mixed".
- "pageNote": a short caveat when something degrades transcription
  confidence — illegible passages, cropping, damage, ligatures you are
  unsure of (omit entirely when the page transcribed cleanly).
Return only the structured output — no prose, no markdown, no code fences.`;

const SCRIPT_LABEL: Record<"print" | "handwriting", string> = {
  print: "printed",
  handwriting: "handwritten",
};

const LANGUAGE_LABEL: Record<"en" | "de" | "mixed", string> = {
  en: "English",
  de: "German",
  mixed: "a mix of English and German",
};

/** Prompt varies by script/language (SPEC v2 §5) — hints hand the model a
 * head start; it still reports its own script/language when none is given. */
function buildPrompt(script?: "print" | "handwriting", language?: "en" | "de" | "mixed"): string {
  const hints: string[] = [];
  if (script) hints.push(`This page is ${SCRIPT_LABEL[script]}.`);
  if (language) hints.push(`It is written in ${LANGUAGE_LABEL[language]}.`);
  const hintText = hints.length > 0 ? ` ${hints.join(" ")}` : "";
  return `Transcribe this page image.${hintText}`;
}

export const POST = guard(async (req) => {
  const body = await readJson(req);
  if (!body.ok) return invalidJson();

  const parsed = OcrRequestSchema.safeParse(body.body);
  if (!parsed.success) return badRequest(zodIssues(parsed.error));
  const { imageDataUrl, model, script, language, fixture } = parsed.data;

  const result = await hfVision({
    schema: OcrWire,
    system: SYSTEM,
    prompt: buildPrompt(script, language),
    imageDataUrl,
    model,
    fixture,
  });
  if (!result.ok) return lacuna(result.dep, result.reason);

  const documentId = crypto.randomUUID();
  const ocrResult = coerceOcrResult(result.data, documentId, { script, language });
  if (ocrResult === null) {
    return lacuna("ocr", "OCR output failed OcrResult validation after the repair pass");
  }

  return ok(ocrResult, { mode: result.mode, fetchedAt: result.fetchedAt });
});
