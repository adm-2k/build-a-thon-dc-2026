/**
 * POST /api/extract — pasted text → Claim[] (SPEC §5, shared by N°01 and N°02).
 *
 * Gemini (thinkingLevel "low" — DATA-CAVEATS addendum §3) with the flat
 * ExtractionWire schema; ids and documentId are server-stamped by
 * coerceClaims so the model never invents identifiers. Cap: 8 claims per
 * document (SPEC §5 — the cap is stated in the UI margin).
 *
 * Answers in fixture mode with no keys (fixtures/gemini/extract-demo.json).
 * Errors are states: ladder bottom → 200 lacuna envelope, never a 500.
 */
import { gemini } from "@/lib/engine/llm";
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
import { coerceClaims, ExtractRequestSchema, ExtractionWire } from "../_lib/wire";

export const maxDuration = 60;

const CLAIM_CAP = 8; // SPEC §5

const SYSTEM = `You are the claim extractor of a scholarly reading apparatus.
Decompose the user's text into at most ${CLAIM_CAP} ATOMIC claims — each a single
assertion that could be independently sourced or disputed. For each claim:
- "text": the claim restated as one self-contained declarative sentence
  (resolve pronouns and elided subjects from context).
- "kind": "empirical" (about how the world is), "normative" (about how it
  ought to be), or "definitional" (about what a term means).
- "confidence": 0–1, your confidence that this is a faithful atomic
  restatement actually asserted by the text.
Prefer the text's load-bearing claims over throat-clearing. Return only the
structured output.`;

export const POST = guard(async (req) => {
  const body = await readJson(req);
  if (!body.ok) return invalidJson();

  const parsed = ExtractRequestSchema.safeParse(body.body);
  if (!parsed.success) return badRequest(zodIssues(parsed.error));

  const result = await gemini({
    schema: ExtractionWire,
    system: SYSTEM,
    prompt: parsed.data.text,
    fixture: "extract-demo",
    thinkingLevel: "low",
  });
  if (!result.ok) return lacuna(result.dep, result.reason);

  const documentId = crypto.randomUUID();
  const claims = coerceClaims(result.data, documentId);
  if (claims === null) {
    return lacuna("gemini", "extractor output failed Claim[] validation after the repair pass");
  }

  const capped = claims.slice(0, CLAIM_CAP);
  await recordEvent("01", "CLAIMS COLLATED", capped.length);
  return ok(capped, { mode: result.mode, fetchedAt: result.fetchedAt });
});
