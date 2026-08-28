/**
 * POST /api/trace — one Claim → SourceVerdict (SPEC §5, N°01).
 *
 * Pipeline: search dep → fetch top pages (cap 2/claim — DATA-CAVEATS §2) →
 * Gemini judge → SourceVerdict. Every rung is a state, never a crash:
 *   - search ladder bottoms out        → "untraceable" (nothing to consult)
 *   - pages unreachable/unextractable  → "weakly_sourced" (DATA-CAVEATS §2:
 *     an empty extraction is a RESULT, never a retry loop)
 *   - judge ladder bottoms out         → "weakly_sourced" (sources found
 *     but unassessed)
 * The live search/fetch clients are Lane A's (routes may not fetch —
 * CLAUDE.md eng rule 2); until they land, the ladder descends past live.
 */
import type { DepMode, SourceVerdict } from "@/lib/engine/schemas";
import { ClaimSchema, SourceVerdictSchema } from "@/lib/engine/schemas";
import { gemini } from "@/lib/engine/llm";
import { z } from "zod";
import { normalizeQuery, notWiredLive, recordEvent, runDep } from "../_lib/adapter";
import {
  badRequest,
  guard,
  invalidJson,
  lacuna,
  ok,
  readJson,
  zodIssues,
} from "../_lib/respond";
import {
  coercePage,
  coerceSearchResults,
  coerceVerdict,
  JudgeWire,
  type ExtractedPage,
} from "../_lib/wire";

export const maxDuration = 60;

const PAGE_CAP = 2; // pages per claim, DATA-CAVEATS §2
const EXTRACT_CHAR_CAP = 6_000; // per page, sent to the judge

const TraceRequestSchema = z.object({ claim: ClaimSchema });

const SYSTEM = `You are the source judge of a scholarly reading apparatus.
Given one claim and the extracted text of candidate sources, decide:
- "status": "sourced" when at least one source substantively supports the
  claim; "weakly_sourced" when sources are topical but do not substantiate
  it (or only partially); "untraceable" when the sources are irrelevant.
- "sources": ONLY the consulted sources that bear on the claim, each with its
  exact "url" and "title", plus "quoteSpan" — a short verbatim quote from the
  extract that grounds your judgment (omit quoteSpan if nothing quotable).
- "rationale": one or two sentences a careful reader can check.
Judge only from the provided extracts. Return only the structured output.`;

function verdictState(
  claimId: string,
  status: SourceVerdict["status"],
  rationale: string,
  sources: SourceVerdict["sources"] = [],
): SourceVerdict {
  // Assembled server-side, still parsed against the contract before leaving.
  return SourceVerdictSchema.parse({ claimId, status, sources, rationale });
}

export const POST = guard(async (req) => {
  const body = await readJson(req);
  if (!body.ok) return invalidJson();

  const parsed = TraceRequestSchema.safeParse(body.body);
  if (!parsed.success) return badRequest(zodIssues(parsed.error));
  const { claim } = parsed.data;

  /* 1 — search */
  const query = normalizeQuery(claim.text);
  const search = await runDep("search", query, notWiredLive("search"));
  if (!search.ok) {
    return ok(
      verdictState(
        claim.id,
        "untraceable",
        `No sources could be consulted: ${search.lacuna.reason}`,
      ),
      { mode: "fixture" },
    );
  }
  const results = coerceSearchResults(search.data).slice(0, PAGE_CAP);
  if (results.length === 0) {
    return ok(
      verdictState(claim.id, "untraceable", "Search returned no results for this claim."),
      { mode: search.mode, fetchedAt: search.fetchedAt },
    );
  }

  /* 2 — fetch + extract (cap 2; empty extraction is a result, not a retry) */
  const viaByUrl = new Map<string, DepMode>();
  const pages: ExtractedPage[] = [];
  for (const r of results) {
    const fetched = await runDep("fetch", r.url, notWiredLive("fetch"));
    if (!fetched.ok) continue;
    const page = coercePage(fetched.data, r.url);
    if (page === null) continue;
    viaByUrl.set(r.url, fetched.mode);
    pages.push({ ...page, title: page.title ?? r.title });
  }
  if (pages.length === 0) {
    return ok(
      verdictState(
        claim.id,
        "weakly_sourced",
        "Sources were found but none could be reached or extracted (paywall, bot-blocking, or empty extraction).",
        results.map((r) => ({ url: r.url, title: r.title, fetchedVia: search.mode })),
      ),
      { mode: search.mode, fetchedAt: search.fetchedAt },
    );
  }

  /* 3 — judge */
  const extracts = pages
    .map(
      (p, i) =>
        `SOURCE ${i + 1}\nurl: ${p.url}\ntitle: ${p.title ?? p.url}\nextract:\n${p.text.slice(0, EXTRACT_CHAR_CAP)}`,
    )
    .join("\n\n---\n\n");
  const judged = await gemini({
    schema: JudgeWire,
    system: SYSTEM,
    prompt: `CLAIM (${claim.kind}): ${claim.text}\n\n${extracts}`,
    fixture: "judge-demo",
    thinkingLevel: "low",
  });
  if (!judged.ok) {
    return ok(
      verdictState(
        claim.id,
        "weakly_sourced",
        `Sources were fetched but could not be assessed: ${judged.reason}`,
        pages.map((p) => ({
          url: p.url,
          title: p.title ?? p.url,
          fetchedVia: viaByUrl.get(p.url) ?? "fixture",
        })),
      ),
      { mode: search.mode, fetchedAt: search.fetchedAt },
    );
  }

  const verdict = coerceVerdict(judged.data, claim.id, viaByUrl, search.mode);
  if (verdict === null) {
    return lacuna("gemini", "judge output failed SourceVerdict validation after the repair pass");
  }

  await recordEvent("01", "CLAIM TRACED");
  return ok(verdict, { mode: judged.mode, fetchedAt: judged.fetchedAt });
});
