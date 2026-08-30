/**
 * POST /api/ner — one document → Entity[] (SPEC v2 §5, N°04 Prosopon).
 *
 * Request is `{documentId, fixture?}` — the client (Prosopon's per-document
 * fan-out) sends only the id; the route looks up the document's text
 * itself via lib/db.ts. Runs through ner()'s own ladder (Gemini primary,
 * HF fallback rung inside live, then cached/fixture/lacuna — DATA-CAVEATS
 * addendum 2 §11); this is its own dep, NOT the shared gemini()/hf()
 * functions, because those are hardcoded to their own fixture directories
 * (fixtures/gemini/, fixtures/hf/) and could never reach fixtures/ner/.
 * Content-hash caching is free: ner() keys on {system, prompt, schema}, and
 * prompt IS the document text, so re-running a known document costs zero
 * quota.
 *
 * `fixture` is optional and never guessed server-side from a random
 * document id — an unnamed request in fixture mode correctly bottoms out
 * at a typed LACUNA rather than attributing an unrelated corpus page's
 * entities to the wrong document (same rationale as /api/ocr's `fixture`).
 */
import { getDocumentById } from "@/lib/db";
import { ner } from "@/lib/engine/llm";
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
import { coerceEntities, NerRequestSchema, NerWire } from "../_lib/wire";

export const maxDuration = 60;

const SYSTEM = `You are the prosopographical register of a scholarly reading
apparatus, extracting named entities from an early-20th-century source
(English or German). For each DISTINCT entity mentioned, return:
- "name": the entity's name as it appears in the text (normalize only
  trivial whitespace — do not translate, expand, or merge name variants).
- "kind": EXACTLY one of "person", "place", "org", "work", "concept" — this
  vocabulary is closed; never invent a kind outside this set. Historical
  conventions apply: honorifics/particles are part of a person's name
  (e.g. "Frhr. v. Something", "Dr.", "Freiherr"); Latinized or period place
  names count as "place" (e.g. "Regiomontanus" as a place-adjacent epithet
  stays "person" if it names a person); named books/articles/artworks are
  "work"; institutions, firms, and government bodies are "org"; abstract
  named ideas or movements (e.g. "Fordismus", "Rationalisierung") are
  "concept".
- "mentions": how many times this exact entity is mentioned in the text.
Under-listing a borderline mention is honest; inventing an entity or a kind
outside the closed set is not. Return only the structured output — no
prose, no markdown, no code fences.`;

export const POST = guard(async (req) => {
  const body = await readJson(req);
  if (!body.ok) return invalidJson();

  const parsed = NerRequestSchema.safeParse(body.body);
  if (!parsed.success) return badRequest(zodIssues(parsed.error));
  const { documentId, fixture } = parsed.data;

  const doc = await getDocumentById(documentId);
  if (doc === null || !doc.raw_text || doc.raw_text.trim() === "") {
    return lacuna("db", "document not found or has no text to run NER on");
  }

  const result = await ner({
    schema: NerWire,
    system: SYSTEM,
    prompt: doc.raw_text,
    fixture,
  });
  if (!result.ok) return lacuna(result.dep, result.reason);

  const entities = coerceEntities(result.data, documentId);
  if (entities === null) {
    return lacuna("ner", "NER output failed Entity[] validation after the repair pass");
  }

  await recordEvent("04", "ENTITIES REGISTERED", entities.length);
  return ok(entities, { mode: result.mode, fetchedAt: result.fetchedAt });
});
