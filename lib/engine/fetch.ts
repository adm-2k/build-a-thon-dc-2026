/**
 * lib/engine/fetch.ts — fetchAndExtract(): the live page-fetch + extraction
 * client (DATA-CAVEATS §2).
 *
 * Server-side fetch, 1.5MB response cap, @mozilla/readability + jsdom.
 * Cap 2 pages/claim, 8 pages/question (SPEC §5) — enforced by the callers
 * (/api/trace, /api/stance), not here.
 *
 * FAILURE POLICY (DATA-CAVEATS §2 — read carefully, it is not the usual
 * throw-on-any-problem pattern):
 *   - An EMPTY extraction (paywall stub, JS-rendered page, thin content)
 *     is a RESULT, not a throw: "the claim's verdict becomes weakly_sourced
 *     ... never a retry loop." Returns {url, title?, text: ""} as a
 *     successful live value; app/api/_lib/wire.ts's coercePage() turns the
 *     empty text into null, and the calling route degrades from there.
 *   - A genuine fetch failure (non-2xx, oversized response, network error,
 *     timeout via the caller's AbortSignal) throws, so dep()'s ladder falls
 *     to cached/fixture — that IS a retry in the honest sense (a different
 *     rung, not hammering the same origin again).
 *
 * This is the liveFn passed to dep("fetch", url, (signal) =>
 * fetchAndExtract(url, signal)) — the caller supplies the AbortSignal
 * (dep.ts's own 5s timeout).
 */
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const MAX_BYTES = 1_500_000; // DATA-CAVEATS §2
const USER_AGENT = "ApparatusBot/1.0 (scholarly reading apparatus; non-commercial research fetch)";

export interface FetchedPage {
  url: string;
  title?: string;
  text: string;
}

export async function fetchAndExtract(url: string, signal: AbortSignal): Promise<FetchedPage> {
  const res = await fetch(url, {
    signal,
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`fetch responded ${res.status}`);
  }

  const declaredLength = res.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_BYTES) {
    throw new Error(`response declared ${declaredLength} bytes, over the 1.5MB cap`);
  }

  const html = await res.text();
  if (html.length > MAX_BYTES) {
    throw new Error("response exceeded the 1.5MB cap");
  }

  const dom = new JSDOM(html, { url });
  let article: ReturnType<Readability["parse"]> = null;
  try {
    article = new Readability(dom.window.document).parse();
  } catch {
    // Readability can throw on malformed markup — an extraction failure,
    // not a fetch failure. Falls through to the empty-text RESULT below.
  }

  const text = article?.textContent?.trim() ?? "";
  const title = article?.title || dom.window.document.title || undefined;
  return { url, title, text }; // empty text is a RESULT (DATA-CAVEATS §2), never a throw
}
