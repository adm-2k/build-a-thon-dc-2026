# DATA-CAVEATS.md — External Dependency Registry
Every external surface the suite touches, its failure modes, the prerender-vs-live decision, and the fixture we commit so judging can never strand us. Claude Code: consult this before implementing any `liveFn`, and keep the **Verify at build start** items as literal first tasks.

Legend — default mode is what ships in Vercel env vars; the ladder (SPEC §4) can always fall further.

---

## 1. Web search API (Tracer sourcing, Map source pool)

- **Choice:** one provider, wrapped once. Preference order: Brave Search API → Tavily → Google Programmable Search JSON. All have free tiers with per-day or per-second caps; conference demos die on per-second caps when a judge asks "do another one."
- **Failure modes:** rate limit (429), thin results for niche claims, SEO junk, latency spikes on venue wifi.
- **Mode:** `live`, 6s timeout. Write-through cache keyed on normalized query.
- **Prerender:** during the afternoon, run the 3 demo queries repeatedly so `dep_cache` is warm; a 429 during finals silently serves the cache with a `COLLATED HH:MM` chip.
- **Fixture:** `fixtures/search/<slug>.json` for the 3 demo inputs, committed.
- **Verify at build start:** which key we actually obtained; put the per-day cap number in this file.

## 2. Page fetch + extraction (both instruments)

- **Method:** server-side fetch, 5s AbortController, then `@mozilla/readability` + `jsdom`. Cap 2 pages/claim, 8 pages/question, 1.5MB response max.
- **Failure modes:** paywalls (NYT/WaPo return stubs), JS-rendered pages extract empty, bot-blocking (403 from Cloudflare-fronted sites), redirects to consent walls, slow origins.
- **Policy:** an empty extraction is a *result* — the claim's verdict becomes `weakly_sourced` with rationale "source unreachable/unextractable," never a retry loop. This is philosophically correct for the tool and operationally safe.
- **Mode:** `live`; cache extracted text (never raw HTML) in `dep_cache` and `source_docs`.
- **Fixture:** extracted-text JSONs for every URL appearing in the demo-query fixtures.

## 3. Gemini (extraction, stance clustering, judging)

- **Failure modes:** malformed JSON despite structured output, free-tier per-minute rate limits, latency spikes, safety refusals on politically contested demo content.
- **Mitigations:** zod parse → one repair re-prompt with the error text → ladder. Content-hash cache in `llm.ts` means re-running the same demo input costs zero quota and returns instantly — rehearse with the exact demo inputs and finals hits cache. Choose demo topics that are contested but not gruesome (e.g., "Is nuclear power the fastest path to decarbonization?" rather than active-war claims) to avoid refusal risk on stage.
- **Rate limit plan:** free AI Studio tier is usually enough for one team; if we hit per-minute caps during parallel build, switch the key to a GCP-billed project (credits) — same API, env-var change only.
- **Mode:** `live` always (this is the one dependency the live demo genuinely exercises). Fixture: canned `Claim[]` and `StanceCluster[]` for the demo inputs as the absolute floor.

## 4. Hugging Face Inference Providers router (formalizer, repair passes)

- **Failure modes:** model cold-start latency, a chosen model unavailable on the routed provider, monthly included credits depleting mid-day (free tier gets *blocked* on some providers once depleted; PRO continues pay-as-you-go), provider-specific quirks in JSON adherence.
- **Mitigations:** pin ONE small instruct model after a warm-up call at build start (candidates: current Qwen or Llama small-instruct via router; whichever answers the warm-up in <3s wins). All calls go through the OpenAI-compatible endpoint so swapping models is a string change. If HF misbehaves twice, `DEP_HF_MODE=cached` and let Gemini do formalization — the formalizer prompt must be written model-agnostic for exactly this reason.
- **Mode:** `live`, 8s timeout.
- **Verify at build start:** PRO active on A's account; warm-up call succeeds; note chosen model here.

## 5. Google Ngram (Begriffs frequency panel)

- **Reality:** no official API. The community uses the unofficial `books.google.com/ngrams/json` endpoint: unversioned, aggressively rate-limited, occasionally breaks, and corpus values are language-specific (`de-2019`, `en-2019`). Treat as scrape-adjacent.
- **Decision:** **never live.** `scripts/harvest-begriffs.ts` runs once, locally, with 2s sleeps between terms, writes `term_snapshots`, done. The runtime page reads only the table. Default mode `cached`; there is no live path in deployed code.
- **Caveat to state on the panel (visible, in mono):** "Frequency curves from Google Books n-grams, sampled at century intervals; OCR noise and corpus composition bias early centuries; finer-grained sampling is future work." That greyed finer-grain toggle is the stated limitation, on screen.
- **Fixture:** the harvest output itself is committed to `fixtures/ngram/` so a fresh DB can be seeded.

## 6. Wiktionary REST (Begriffs etymology chain)

- **Failure modes:** etymology sections are freeform prose, inconsistent across entries, sometimes absent; German entries differ structurally from English; HTML-in-JSON needs cleaning.
- **Pipeline:** harvest script fetches → HF/Gemini repair pass reformats into the `senses`/chain schema → human-skim before committing (5 terms, 2 minutes of eyeballing — cheap accuracy insurance).
- **Decision:** same as ngram — **harvest-time only, never runtime.** Default mode `cached`.
- **Attribution:** CC BY-SA; credit Wiktionary in the colophon of the Begriffs panel.

## 7. Supabase

- **Failure modes:** free-tier project pausing (only after ~1 week idle — irrelevant today), connection exhaustion if anything imports a raw Postgres driver (we don't — supabase-js REST only), Realtime channel flakiness on venue wifi.
- **Mitigations:** ticker falls back to 5s polling (SPEC §5); all writes go through 3 helper functions in `db.ts` so there is exactly one place to add retry.
- **Size discipline:** derived JSON only, no raw HTML; target <20MB day-end. Nothing about this build strains 500MB unless someone caches full pages — the wrapper makes that impossible.

## 8. Vercel (the deployment itself)

- **Facts that matter:** Hobby with Fluid compute (default on new projects) allows up to 300s max duration — our explicit 60s per route is comfortably inside it. Screenshot allowances (1M invocations, 100 GB-hrs, 100GB transfer) exceed a demo day by ~4 orders of magnitude. Hobby cannot import repos owned by a GitHub *organization* — the repo lives under the personal account, so fine.
- **Failure modes:** build failing at the worst moment (mitigation: deploy skeleton at T+0:20 and keep `main` green — feature branches only), env var typos (mitigation: `lib/env.ts` zod-validates all env vars at boot and fails loudly), teammate pushes not deploying on Hobby (mitigation: A merges to `main`; deploys ride A's account).
- **Mode:** n/a — but the ladder means even a total loss of every external service leaves a deployed, navigable, fixture-fed suite.

## 9. Venue wifi (the meta-dependency)

Everything above degrades together when wifi does. The design answer is already in the architecture: exactly one flow (Tracer paste → extract → formalize) is required to be live, and it needs only LLM egress; everything else carries a provenance chip and a cached path. Rehearse once with wifi, once with `DEP_*_MODE=cached` across the board. If the second rehearsal looks acceptable, nothing that happens at 4:45 can hurt us.

---

## Judge-facing summary (lift into the README / final slide)

This prototype gestures at what LLM semantic capacity unlocks for close reading at web scale — logical anatomy of claims, stance ontologies, concept history. We therefore engineered for honesty over illusion: every externally-derived datum is stamped live / collated / from-the-record, unreachable sources are verdicts rather than errors, and the diachronic instrument ships greyed with its sampling limits stated on the panel. The limitation section is not an apology; it is the apparatus.

---

## Addendum — web-verified 2026-08-28 (pre-event research pass)

The registry above was written before verification. These findings correct it;
where they conflict with a section above, **this addendum wins**. Full source
URLs live in the research record; every number below was read from an official
page or a live endpoint on 2026-08-28.

### §1 Search — the preference order is dead; Tavily is primary

- **Google Programmable Search JSON API: closed to new customers, discontinued
  2027-01-01.** A fresh signup cannot obtain a working key. Remove from the
  ladder.
- **Brave Search API dropped its card-free tier (Feb 2026):** now $5/month in
  free credits (~1,000 searches) with a **mandatory credit card**, and the
  effective QPS while on free credits is unverified (docs say 50 req/s; field
  reports say 1 QPS on free credits). Measure the `X-RateLimit-Limit` header
  before trusting it with parallel calls. Fallback only.
- **Tavily is primary:** free "Researcher" tier, no card, 1,000 credits/month
  (basic search = 1 credit), **100 requests/minute** on the dev tier — absorbs
  Tracer's 8-parallel-claims burst plus a judge's "do another one."
  `POST https://api.tavily.com/search`, `Authorization: Bearer tvly-…`, body
  `{"query","max_results":8,"search_depth":"basic"}`; `results[]{title,url,content,score}`
  maps 1:1 onto `{url,title,snippet}`. Key visible on the dashboard ~5 min
  after signup at https://app.tavily.com.

### §3 Gemini — the pin is DEAD for this project; the upgrade plan and the SDK pattern changed

- **`gemini-2.5-flash` is closed to new users** — live-verified on the
  project's actual key 2026-08-28: `generateContent` returns 404 "no longer
  available to new users" even though the model still appears in the models
  list (listing ≠ usable). The pin moves to env — ORCHESTRATION §8 T10:
  **`GEMINI_MODEL=gemini-3.6-flash`** (Google's stated migration target;
  verified 200 on this key, ~1s with 2-token output). Fallback:
  `gemini-3.5-flash` (verified 200). **Not `gemini-3.7-flash`** — timed out
  at 30s on a default call from this key. 3.x models use `thinkingLevel`
  ("low" for extract/judge — thinking is on by default and burned ~95
  thought-tokens on a 2-token answer in the verification call).
  `gemini-2.0-flash*` is **shut down** — reject any copied snippet that
  references it.
- **The "switch to GCP-billed project (credits)" escape hatch above is dead:**
  since March 2026, GCP free-trial/welcome credits are explicitly excluded
  from the Gemini API. The real path is *better*: "Set up billing" on the
  existing project with a **$10 Tier 1 prepay** — same project, **same key,
  zero env changes**, takes effect near-instantly, ~30× RPM headroom.
- **Rate limits are no longer published**: numbers must be read logged-in at
  https://aistudio.google.com/rate-limits (limits are **per project, not per
  key** — a second key doubles nothing). Third-party consensus for 2.5-flash
  free tier: ~10 RPM / 250K TPM / 250–500 RPD (RPD conflicts; plan on 250,
  read the real number at build start and write it here). RPD resets midnight
  Pacific — no same-day rescue. 429 → serve cache, never retry-storm.
- **AI SDK pattern moved:** current majors `ai@7` + `@ai-sdk/google@4`;
  `generateObject`/`streamObject` are deprecated — use
  `generateText` + `output: Output.object({ schema })`, reading
  `result.output`. The provider reads `GOOGLE_GENERATIVE_AI_API_KEY`
  (never `GEMINI_API_KEY`/`GOOGLE_API_KEY` — those are Google's own SDKs).
- **Gemini structured output rejects `z.union()`** (OpenAPI 3.0 subset) —
  keep `Claim[]`/`StanceCluster[]` schemas flat; `z.enum`/nullable are fine.
  `NoObjectGeneratedError` may report `finishReason: "content-filter"` when
  the real cause is schema incompatibility — route it to the
  one-repair-then-ladder path, not the refusal path.
- **Thinking is on by default and costs seconds per call** — set the minimum
  (`thinkingBudget` low on 2.5, `thinkingLevel: "low"` on 3.x) for extract and
  judge calls. Safety refusal risk is lower than assumed: default block
  thresholds are Off for 2.5/3 models — keep the contested-but-not-gruesome
  topic rule for the residual core filters.

### §4 Hugging Face — free tier is a trap; PRO required

- Free tier includes **$0.10/month** in credits and **hard-blocks** on
  depletion (pay-as-you-go requires a manual credit purchase). **PRO ($9/mo,
  card required) gets $2.00/mo credits and degrades to automatic
  pay-as-you-go** — upgrade account A *before* event day.
- Router verified: `https://router.huggingface.co/v1` (chat completions only),
  OpenAI-compatible, `apiKey = HF_TOKEN`. Token: fine-grained with the "Make
  calls to Inference Providers" permission —
  https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained
- **Formalizer pin (live-verified on the router):**
  `Qwen/Qwen3-4B-Instruct-2507:nscale` — structured-output capable, ~600ms
  first token, $0.01/$0.03 per M tokens; non-thinking, so no reasoning-token
  latency inside the 8s timeout. Failover: bare id
  `Qwen/Qwen3-4B-Instruct-2507` (router picks fastest live provider), then
  Gemini per the ladder. Runner-up: `openai/gpt-oss-20b` with
  `reasoning_effort:"low"`. **Model catalog churns — Llama-3.2-3B and
  Qwen2.5-7B are NOT on the router today**; never hardcode from memory, and
  keep the pin in `HF_FORMALIZER_MODEL` so a swap is an env change.

### §5 Ngram — endpoint alive; one silent failure mode found

- `https://books.google.com/ngrams/json?content=<term>&year_start=1500&year_end=2019&corpus=en-2019&smoothing=0`
  live-verified (also `de-2019`; `en-2022`/`de-2022` exist and extend to 2022).
  Response: `[{ngram, type, timeseries: number[]}]`, one float per year
  inclusive; empty array + HTTP 200 = "no data" (never retry).
- **An invalid corpus id returns HTTP 200 with data from a silent fallback
  corpus** — a typo plots the wrong corpus without erroring. The harvest script
  must assert corpus ids against the allowlist `{en-2019, de-2019}`.

### §6 Wiktionary — the REST definition endpoint is English-only

- `en.wiktionary.org/api/rest_v1/page/definition/{term}` works (definitions
  only, HTML-in-JSON, **no etymology**); the same path on **de.wiktionary.org
  returns HTTP 501**.
- Etymology for both languages: MediaWiki Action API two-step —
  `action=parse&prop=sections` to find the Etymology/Herkunft section index,
  then `&section=<i>&prop=wikitext` — live-verified for `experience` and
  `Erfahrung`; feed the wikitext to the LLM repair pass as planned.
- Etiquette (required): unique `User-Agent` with contact info on every
  Wikimedia request; ≤200 req/s cap. License: footers now say **CC BY-SA 4.0**
  — credit in the Begriffs colophon.

### §7 Supabase — the key regime changed under the SPEC

- Projects created after 2025-11-01 have **no anon/service_role JWT keys**:
  they issue `sb_publishable_…` and `sb_secret_…` keys. Put the `sb_secret_`
  value in `SUPABASE_SERVICE_ROLE_KEY` (drop-in for `createClient`, per the
  official migration guide). Keys live under Settings → API Keys; project URL
  under the Connect button / Data API settings.
- Pin `@supabase/supabase-js@^2.112.4` — **do not** install the `3.0.0-next`
  pre-release dist-tag.
- Free plan verified: 500MB DB, unlimited API requests, 5GB egress, Realtime
  200 concurrent / 2M messages/month; pausing after 1 week idle (irrelevant).
- Ticker ruling reinforced: browser Realtime would need the publishable key in
  the client **with RLS disabled on all tables** (SPEC non-goal) — that hands
  full DB read/write to any audience laptop. Polling stays the default;
  `alter publication supabase_realtime add table events;` only if Realtime is
  ever pursued.

### §8 Vercel — two live-demo traps + corrected numbers

- **Preview URLs are behind a Vercel login wall by default** (Deployment
  Protection / Vercel Authentication, default-on since 2023; since 2025-07 it
  also covers the `*-git-main.vercel.app` alias on new projects). Judges get
  the **canonical production domain only**, or A toggles Settings → Deployment
  Protection → Vercel Authentication OFF on day one. Hobby gets exactly **1
  shareable link total** — don't burn it.
- **Env-var changes apply only to new deployments**: every `DEP_*_MODE` flip
  costs a redeploy (~1–3 min, 1 concurrent build slot on Hobby). Rehearse the
  flip before finals.
- **Branch pushes trigger preview builds by default** — at five lanes'
  rebase/force-push cadence that overruns the 100-deploys/day cap and queues
  production behind junk previews. Mitigation (mandatory, ships in the
  scaffold): `vercel.json` Ignored Build Step
  `{"ignoreCommand": "[ \"$VERCEL_GIT_COMMIT_REF\" != \"main\" ]"}` so only
  `main` ever builds.
- Corrected allowances (Hobby, monthly): 1M function invocations, 4 Active-CPU
  hrs + 360 GB-hrs provisioned memory (not "100 GB-hrs"), 100GB transfer, 100
  deploys/day and 100 builds/rolling hour, 1 concurrent build. Fluid compute
  default-on; `export const maxDuration = 60` confirmed as current App Router
  syntax, inside the 300s Fluid cap. Repo `adm-2k/build-a-thon-dc-2026` is
  personal + public — the Hobby org-repo restriction does not apply.

### Scaffold version pins (npm, 2026-08-28)

`next@16.3.3` · `zod@4.4.3` · `cytoscape@3.34.2` ·
`@supabase/supabase-js@2.112.4` · `@mozilla/readability@0.6.0` ·
`jsdom@30.0.1` (requires Node ^22.22.2 || ^24.15.0 || ≥26 — Vercel default is
Node 24.x; **check local Node versions in every worktree at setup**).

---

## Addendum 2 — web-verified 2026-08-30 (post-buildathon rescope: OCR + NER)

Where this conflicts with anything above, **this addendum wins**. Verified live
on the project's HF token against the production router on 2026-08-30.

### §10 OCR via the HF Inference Providers router (Scriptorium, N°00)

- **There are NO dedicated OCR models (TrOCR/Kraken-style) on the router** —
  it serves chat completions only. OCR runs through **vision-language models**
  with an `image_url` content part (base64 data URL). This is what makes the
  swap-on-the-fly requirement trivial: the model is a per-request string.
- **Router VLM inventory (2026-08-30, 136 models total):** the OCR-capable set
  is `Qwen/Qwen3-VL-30B-A3B-Instruct`, `Qwen/Qwen3-VL-235B-A22B-Instruct`
  (+Thinking), `Qwen/Qwen2.5-VL-72B-Instruct`, `google/gemma-3-27b-it`
  (+12b/4b), `CohereLabs/aya-vision-32b`, `baidu/ERNIE-4.5-VL-424B-A47B-Base-PT`.
  The catalog churns — re-list (`GET /v1/models`) before pinning anything new.
- **Live A/B on a dense 1900 German Antiqua page** (500px scan, "Die Kunst"
  Bd. 4, IA via Wikimedia):
  - `Qwen/Qwen3-VL-30B-A3B-Instruct` — **36s**, near-faithful line-true
    transcription (errors of the OCR kind: proper names, ligatures). **The pin:
    `HF_OCR_MODEL=Qwen/Qwen3-VL-30B-A3B-Instruct`.**
  - `google/gemma-3-27b-it` — **4s**, noticeably lossier; correctly identified
    language and print type. The "fast draft" registry entry.
  - Consequence (ruling T13): dep timeout for `ocr` is **50s**, inside the 60s
    route budget; never reuse the 8s text-formalizer timeout.
- **Registry for the model picker** (UI lists these; free-text override allowed):
  `Qwen/Qwen3-VL-30B-A3B-Instruct` (default, quality) ·
  `google/gemma-3-27b-it` (fast draft) · `Qwen/Qwen2.5-VL-72B-Instruct`
  (second opinion) · `CohereLabs/aya-vision-32b` (multilingual alt).
  Fraktur/Kurrent accuracy comparison on real scans is a Round-2 item — until
  then the script toggle changes the PROMPT, not the model.
- **Image discipline:** client-side downscale to ≤1600px longest edge, JPEG;
  base64 data URL in the message content. A 500px page already OCRs usably;
  1600px is the quality/latency sweet spot. Never store the image — only the
  transcription and the image's sha256 (provenance key).
- **Ladder:** live HF VLM → live Gemini vision (same prompt, same flat output
  shape) → dep_cache → `fixtures/ocr/<slug>.json` → LACUNA. 429 → cache, no
  retry (PRO PAYG makes true 429s rare; cold starts show up as latency, not
  errors).

### §11 NER (Prosopon, N°04)

- **Gemini primary** (structured output, flat `{entities: Entity[]}` schema,
  `thinkingLevel: "low"`): one call per document, content-hash cached in
  `dep_cache` (`dep='ner'`) — re-rendering the network costs zero quota for
  known documents. HF text model as fallback rung, fixture floor at
  `fixtures/ner/`.
- Entity `kind` vocabulary is closed (`person|place|org|work|concept`) and
  lives in schemas.ts; the prompt must instruct historical-text conventions
  (e.g. "Frhr. v." honorifics, Latinized place names) and forbid inventing
  kinds. Name normalization beyond exact-match merging is Round 2 —
  under-merging is honest, over-merging silently fabricates a network.

### §12 The network reality on the build machine

Cisco Umbrella on this machine's network MITMs TLS broadly and **blocks
`*.vercel.app` outright** (403 + OpenDNS block page; `vercel.com` and
`api.vercel.com` are reachable; `router.huggingface.co`, `commons.wikimedia.org`,
`generativelanguage.googleapis.com` all verified reachable). Consequences:
production checks run via the `prodcheck` GitHub Action, never local curl;
production itself sits behind Vercel Authentication (302) until A toggles
Deployment Protection off — external probes confirmed the deployment EXISTS at
`build-a-thon-dc-2026-adm-2ks-projects.vercel.app`.
