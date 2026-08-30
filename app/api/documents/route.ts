/**
 * GET+POST /api/documents — the corpus (SPEC v2 §0/§5).
 *
 * GET  → Document[], newest first. Feeds Tracer's corpus picker, Map's
 *        multi-select, and Prosopon's per-document NER sweep.
 * POST → persists one document ("Fix in the record" from Scriptorium, and
 *        the eventual home for Tracer's paste box — SPEC §0). When the save
 *        carries OCR metadata (`ocr: {model, script, language}`), the route
 *        ALSO write-throughs the OcrResult to dep_cache under `dep='ocr'`,
 *        keyed on the sha256 already embedded in `sourceUrl` as
 *        "scriptorium:<sha256>" — that IS the image content hash SPEC §3b
 *        calls for, never re-derived. Best-effort: a failed write-through
 *        never fails the document save.
 *
 * Answers [] / a typed LACUNA in keyless mode — a corpus round-trip
 * genuinely needs Supabase, so a keyless POST reports a LACUNA rather than
 * faking a persisted id (CLAUDE.md eng rule 5: honesty over illusion).
 */
import { insertDocument, listDocuments, writeDepCache } from "@/lib/db";
import { OcrResultSchema } from "@/lib/engine/schemas";
import { recordEvent } from "../_lib/adapter";
import {
  badRequest,
  guard,
  invalidJson,
  lacuna,
  ok,
  readJson,
  zodIssues,
} from "../_lib/respond";
import { coerceDocument, coerceDocuments, DocumentCreateRequestSchema } from "../_lib/wire";

export const maxDuration = 60;

/** "scriptorium:<sha256>" — the image content hash SPEC §3b keys the OCR
 * dep_cache write-through on; anything else means no image to key against. */
const SCRIPTORIUM_HASH_RE = /^scriptorium:([0-9a-f]{64})$/i;

export const GET = guard(async () => {
  const rows = await listDocuments();
  return ok(coerceDocuments(rows));
});

export const POST = guard(async (req) => {
  const body = await readJson(req);
  if (!body.ok) return invalidJson();

  const parsed = DocumentCreateRequestSchema.safeParse(body.body);
  if (!parsed.success) return badRequest(zodIssues(parsed.error));
  const { text, sourceUrl, tool, ocr } = parsed.data;

  const row = await insertDocument({ raw_text: text, source_url: sourceUrl, tool });
  if (row === null) {
    return lacuna("db", "Supabase is not configured — the corpus could not be saved");
  }
  const document = coerceDocument(row);
  if (document === null) {
    return lacuna("db", "the saved document row failed Document validation");
  }

  // Best-effort OCR-metadata write-through (SPEC §3b) — never fails the save.
  if (ocr && sourceUrl) {
    const match = SCRIPTORIUM_HASH_RE.exec(sourceUrl);
    if (match) {
      const payload = OcrResultSchema.safeParse({
        documentId: document.id,
        text,
        model: ocr.model,
        script: ocr.script,
        language: ocr.language,
      });
      if (payload.success) {
        await writeDepCache("ocr", match[1].toLowerCase(), payload.data);
      }
    }
  }

  await recordEvent("00", "PAGE FIXED IN THE RECORD");
  return ok(document);
});
