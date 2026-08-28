/**
 * POST /api/formalize — one Claim → its LogicalForm (SPEC §5, N°01).
 *
 * HF router primary (HF_FORMALIZER_MODEL, model-agnostic prompt —
 * DATA-CAVEATS §4), Gemini fallback when HF bottoms out. claimId is
 * re-attached server-side; the model never sees or invents ids.
 *
 * Answers in fixture mode with no keys (fixtures/hf/formalize-demo.json).
 */
import { ClaimSchema } from "@/lib/engine/schemas";
import { gemini, hf } from "@/lib/engine/llm";
import { z } from "zod";
import {
  badRequest,
  guard,
  invalidJson,
  lacuna,
  ok,
  readJson,
  zodIssues,
} from "../_lib/respond";
import { coerceLogicalForm, FormalizeWire } from "../_lib/wire";

export const maxDuration = 60;

const FormalizeRequestSchema = z.object({ claim: ClaimSchema });

const SYSTEM = `You formalize natural-language claims into minimal logical form.
Given one claim, return:
- "premises": the implicit or explicit premises as short declarative strings
  (empty array when the claim is a bare assertion).
- "conclusion": the claim's conclusion as one declarative string.
- "operator": "asserts" (empirical/definitional statement), "obligates"
  (ought/should/must), "permits" (may/is allowed), or "predicts" (will/would).
- "formalization": a compact schema like "P1 ∧ P2 → C" or "C" that names each
  premise Pn and the conclusion C, with → for inference, ∧ for conjunction,
  and O(·)/P(·) marking obligation/permission where the operator warrants it.
Return only the structured output — no prose.`;

export const POST = guard(async (req) => {
  const body = await readJson(req);
  if (!body.ok) return invalidJson();

  const parsed = FormalizeRequestSchema.safeParse(body.body);
  if (!parsed.success) return badRequest(zodIssues(parsed.error));
  const { claim } = parsed.data;

  const prompt = `Claim (${claim.kind}): ${claim.text}`;
  const call = {
    schema: FormalizeWire,
    system: SYSTEM,
    prompt,
    fixture: "formalize-demo",
  };

  // HF primary; Gemini fallback only when HF's own ladder bottoms out.
  let result = await hf(call);
  if (!result.ok) {
    console.warn(`[formalize] hf lacuna (${result.reason}) — Gemini fallback`);
    result = await gemini({ ...call, thinkingLevel: "low" });
  }
  if (!result.ok) return lacuna(result.dep, result.reason);

  const logicalForm = coerceLogicalForm(result.data, claim.id);
  if (logicalForm === null) {
    return lacuna("hf", "formalizer output failed LogicalForm validation after the repair pass");
  }

  return ok(logicalForm, { mode: result.mode, fetchedAt: result.fetchedAt });
});
