/**
 * lib/engine/search.ts — tavilySearch(): the live web search client.
 *
 * DATA-CAVEATS §1 + addendum §1 (ruling T9 — Google is closed to new
 * customers, Brave needs a card with ambiguous free-tier QPS; Tavily is
 * primary): `POST https://api.tavily.com/search`, `Authorization: Bearer
 * <SEARCH_API_KEY>`, body `{query, max_results, search_depth:"basic"}`.
 * Response shape `results[]{title,url,content,score}` is handled by
 * app/api/_lib/wire.ts's coerceSearchResults() already — this returns the
 * raw parsed JSON, uncoerced, so dep()'s write-through caches the same
 * payload a cache/fixture read would later serve.
 *
 * This is the liveFn passed to dep("search", key, tavilySearch(query)) —
 * the caller supplies the AbortSignal (dep.ts's own 6s timeout, per
 * DATA-CAVEATS §1) and normalizes the query key (app/api/_lib/adapter.ts's
 * normalizeQuery).
 */
import { env } from "../env";

const TAVILY_URL = "https://api.tavily.com/search";
const MAX_RESULTS = 8; // DATA-CAVEATS §1 / SPEC §5 source cap

export async function tavilySearch(query: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SEARCH_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      max_results: MAX_RESULTS,
      search_depth: "basic",
    }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Tavily search responded ${res.status}`);
  }
  return res.json() as Promise<unknown>;
}
