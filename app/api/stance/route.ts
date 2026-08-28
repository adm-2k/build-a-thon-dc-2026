/**
 * POST /api/stance — contested question → StanceCluster[] (SPEC §5, N°02).
 *
 * Pipeline: search dep (n=8) → fetch+extract each (parallel, capped) → ONE
 * Gemini clustering call over all extracts → StanceCluster[]. A page that
 * cannot be fetched still enters the pool on its snippet (an empty
 * extraction is a result — DATA-CAVEATS §2); a search lacuna is the page's
 * LACUNA state, not a crash.
 */
import { gemini } from "@/lib/engine/llm";
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
  ClustersWire,
  coerceClusters,
  coercePage,
  coerceSearchResults,
  StanceRequestSchema,
} from "../_lib/wire";

export const maxDuration = 60;

const SOURCE_CAP = 8; // pages per question, SPEC §5 / DATA-CAVEATS §2
const EXTRACT_CHAR_CAP = 4_000; // per source, sent to the clusterer

const SYSTEM = `You are the stance cartographer of a scholarly reading apparatus.
Given a contested question and a pool of sources, cluster the sources into
2–6 distinct STANCES (not topics): groups that answer the question the same
way for the same kind of reason. For each cluster return:
- "id": a short slug unique within your answer (e.g. "nuclear-first").
- "label": the stance named as a position, ≤ 8 words.
- "sources": the member sources, copying "url" and "title" EXACTLY as given;
  set "extractedText" to a one-sentence distillation of that source's point.
- "coreClaimIds": [] (claim linking happens elsewhere).
- "agreesWith" / "disputes": ids of OTHER clusters this stance substantively
  agrees with or disputes — the typed disagreement edges.
- "evidenceKind": the dominant evidence type, one short phrase (e.g.
  "deployment statistics", "cost modeling", "normative argument").
Every source belongs to exactly one cluster. Return only the structured output.`;

export const POST = guard(async (req) => {
  const body = await readJson(req);
  if (!body.ok) return invalidJson();

  const parsed = StanceRequestSchema.safeParse(body.body);
  if (!parsed.success) return badRequest(zodIssues(parsed.error));
  const { question } = parsed.data;

  /* 1 — search (n=8) */
  const search = await runDep("search", normalizeQuery(question), notWiredLive("search"));
  if (!search.ok) return lacuna(search.lacuna.dep, search.lacuna.reason);
  const results = coerceSearchResults(search.data).slice(0, SOURCE_CAP);
  if (results.length === 0) {
    return lacuna("search", "search returned no sources for this question");
  }

  /* 2 — fetch + extract in parallel; fall back to the search snippet */
  const pool = await Promise.all(
    results.map(async (r) => {
      const fetched = await runDep("fetch", r.url, notWiredLive("fetch"));
      const page = fetched.ok ? coercePage(fetched.data, r.url) : null;
      const text = page?.text ?? r.snippet ?? "";
      return { url: r.url, title: page?.title ?? r.title, text };
    }),
  );
  const sources = pool.filter((s) => s.text.trim().length > 0);
  if (sources.length === 0) {
    return lacuna("fetch", "no source in the pool could be extracted or summarized");
  }

  /* 3 — one clustering call over the whole pool */
  const digest = sources
    .map(
      (s, i) =>
        `SOURCE ${i + 1}\nurl: ${s.url}\ntitle: ${s.title}\ntext:\n${s.text.slice(0, EXTRACT_CHAR_CAP)}`,
    )
    .join("\n\n---\n\n");
  const clustered = await gemini({
    schema: ClustersWire,
    system: SYSTEM,
    prompt: `QUESTION: ${question}\n\n${digest}`,
    fixture: "stance-demo",
    thinkingLevel: "low",
  });
  if (!clustered.ok) return lacuna(clustered.dep, clustered.reason);

  const clusters = coerceClusters(clustered.data);
  if (clusters === null) {
    return lacuna("gemini", "clustering output failed StanceCluster[] validation after the repair pass");
  }

  await recordEvent("02", "STANCES MAPPED", clusters.length);
  return ok(clusters, { mode: clustered.mode, fetchedAt: clustered.fetchedAt });
});
