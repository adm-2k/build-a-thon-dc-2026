# SPEC.md — Apparatus Build Specification
**DevFestDC 2026 Buildathon · single deployment, hub + instruments**
Status: FROZEN for the sprint. Changes require A's sign-off. Claude Code: read this file, `CLAUDE.md`, `DESIGN-BRIEF.md`, and `docs/DATA-CAVEATS.md` before writing code.

---

## 0. What we are building (90 seconds)

**Apparatus** is one deployed Next.js application containing a hub catalogue and two working instruments, submitted against two official buildathon concepts:

| N° | Instrument | Official concept | One-line function |
|----|-----------|------------------|-------------------|
| 01 | **Tracer** | 1.1 Claim Tracer | Paste text → atomic claims → logical form → source status (Sourced / Weakly Sourced / Untraceable) |
| 02 | **Map** | 1.4 Disagreement Map | Contested question → 5–8 sources → stances clustered → typed disagreement graph |
| 03 | **Begriffs** | (stretch, greyed) | Term → etymology chain + century-interval frequency panel; visible but marked `LACUNA — future work` |

The differentiator: Tracer renders each claim's **logical form** (premises → conclusion, empirical vs. normative operator) before sourcing it. Map renders positions as a **typed stance ontology**, not a link dump. N°03 exists on screen to state scope honestly (demo checklist item 4).

**Non-goals (do not build):** auth, user accounts, mobile-specific layouts, fine-tuning, editing/persistence of user sessions beyond one table row, any second graph library, dark-mode QA beyond the tokens.css contract.

---

## 1. Stack (decided — do not relitigate)

- **Next.js (App Router) + TypeScript**, single app, single Vercel project, Fluid compute on (default). `maxDuration = 60` set explicitly on every LLM-touching route.
- **Styling:** Tailwind utilities mapped to `tokens.css` custom properties. tokens.css is copied verbatim from the design repo; it is the only file allowed to contain hex values.
- **DB:** Supabase (free tier), accessed **only from server route handlers** via `supabase-js` with the service-role key. The browser never imports the Supabase client. No RLS work.
- **LLM primary:** Gemini 2.5 Flash via Vercel AI SDK (`ai` + `@ai-sdk/google`), structured output with zod schemas.
- **LLM secondary (cheap/volume):** one small instruct model via the Hugging Face Inference Providers router (OpenAI-compatible endpoint). Pin the exact model at build start after a warm-up call — see DATA-CAVEATS §5.
- **Graph:** Cytoscape.js, one shared `<OntologyGraph>` component, pigment palette from tokens (`--chart-*` order, per CLAUDE.md rule 7).
- **Validation:** zod everywhere an LLM or external API produces data. A failed parse triggers exactly one repair pass (re-prompt with the zod error), then falls to the dependency ladder (§4).

---

## 2. Repository layout

```
apparatus/
  CLAUDE.md                  ← design rules (existing) + engineering rules (appended)
  SPEC.md                    ← this file
  DESIGN-BRIEF.md  tokens.css
  docs/
    DATA-CAVEATS.md          ← dependency registry + fallback ladder
    WORKTREE-PLAN.md         ← parallel agent lanes
  app/
    layout.tsx  page.tsx     ← hub catalogue (compartment cells, ticker)
    tracer/page.tsx          ← N°01 UI
    map/page.tsx             ← N°02 UI
    begriffs/page.tsx        ← N°03 greyed panel (static, reads cache if present)
    api/
      extract/route.ts       ← text → Claim[] (shared by 01 and 02)
      formalize/route.ts     ← Claim → LogicalForm
      trace/route.ts         ← Claim → SourceVerdict (search + fetch + judge)
      stance/route.ts        ← question → SourceDoc[] → StanceCluster[]
      events/route.ts        ← ticker writes
  components/
    ui/                      ← FolioHeader, Colophon, ApparatusMargin, Compartment,
                               ProvenanceChip, Ticker, LacunaState
    OntologyGraph.tsx
  lib/
    engine/
      schemas.ts             ← ALL zod schemas + inferred TS types (single source of truth)
      llm.ts                 ← gemini() and hf() callers, one retry, content-hash cache
      dep.ts                 ← dependency ladder wrapper (§4)
      graph.ts               ← Claim[]/StanceCluster[] → Cytoscape elements
    db.ts                    ← server-only Supabase client + typed table helpers
  scripts/
    harvest-begriffs.ts      ← one-shot: seed terms → ngram/wiktionary → term_snapshots
    seed-fixtures.ts         ← loads demo fixtures into DB
  fixtures/                  ← JSON fixtures per dependency (committed to git)
```

Ownership boundaries (anti-collision, see WORKTREE-PLAN): `lib/engine/*` is Lane A only; each `app/<tool>` directory has one owner; `components/ui` changes go through Lane E.

---

## 3. Data contracts (`lib/engine/schemas.ts`)

These types are the interfaces between lanes. Freeze them first; UI and pipeline work proceed in parallel against them.

```ts
Claim = { id, documentId, text, kind: "empirical" | "normative" | "definitional",
          confidence: number }                      // extractor output
LogicalForm = { claimId, premises: string[], conclusion: string,
          operator: "asserts" | "obligates" | "permits" | "predicts",
          formalization: string }                    // e.g. "P1 ∧ P2 → C"
SourceVerdict = { claimId, status: "sourced" | "weakly_sourced" | "untraceable",
          sources: { url, title, quoteSpan?, fetchedVia: DepMode }[] , rationale }
StanceCluster = { id, label, sources: SourceDoc[], coreClaimIds: string[],
          agreesWith: string[], disputes: string[], evidenceKind: string }
SourceDoc = { id, url, title, extractedText?, stanceClusterId? }
TermSnapshot = { term, yearBucket: number, relFreq?: number,
          senses: { gloss, firstAttested?, note }[], provenance: DepMode }
DepMode = "live" | "cached" | "fixture"
TickerEvent = { instrument: "01"|"02"|"03", verb: string, count?: number, at: timestamp }
```

## 3b. Postgres DDL (run once in Supabase SQL editor)

```sql
create table documents   (id uuid primary key default gen_random_uuid(),
                          raw_text text, source_url text, tool text, created_at timestamptz default now());
create table claims      (id uuid primary key default gen_random_uuid(),
                          document_id uuid references documents, text text, kind text,
                          logical_form jsonb, verdict jsonb, created_at timestamptz default now());
create table source_docs (id uuid primary key default gen_random_uuid(),
                          query text, url text, title text, extracted_text text,
                          stance jsonb, created_at timestamptz default now());
create table term_snapshots (term text, year_bucket int, data jsonb, provenance text,
                          primary key (term, year_bucket));
create table dep_cache   (dep text, key_hash text, payload jsonb, fetched_at timestamptz,
                          primary key (dep, key_hash));
create table events      (id bigint generated always as identity primary key,
                          instrument text, verb text, count int, at timestamptz default now());
```

`dep_cache` is the generic cache behind the ladder — every external call writes through it. Store extracted/derived JSON, never raw HTML (size discipline; Supabase free tier is 500MB and we should end the day under 20MB).

---

## 4. The dependency ladder (core architectural pattern)

Every external dependency is called through `dep(name, key, liveFn)` in `lib/engine/dep.ts`:

1. **Mode resolution:** `DEP_<NAME>_MODE` env var (`live | cached | fixture`), default `live`.
2. **live:** run `liveFn` with an AbortController timeout (values per dependency in DATA-CAVEATS). On success → write through to `dep_cache` → return `{data, mode:"live"}`. On timeout/error → fall to cached.
3. **cached:** read `dep_cache` by `(dep, sha256(key))`. Hit → `{data, mode:"cached", fetchedAt}`. Miss → fall to fixture.
4. **fixture:** read `fixtures/<dep>/<slug>.json`. Hit → `{data, mode:"fixture"}`. Miss → return typed `Lacuna` error; UI renders the `LACUNA` empty state (never a crash, never a spinner that hangs).

**UI rule:** every piece of externally-derived data renders a `ProvenanceChip` — `COLLATED 12:41` (cached), `LIVE`, or `FROM THE RECORD` (fixture) — in the apparatus margin. This converts our fallback engineering into visible scholarly honesty, which is the judging posture: the prototype gestures toward what LLM semantic capacities unlock, and says plainly which parts are live.

Flipping one env var in Vercel puts any flaky dependency into demo-safe mode without a code change.

---

## 5. Pipelines

**Tracer (N°01):** paste → `POST /api/extract` (Gemini, zod `Claim[]`) → render claim list immediately → per-claim `POST /api/formalize` (HF small model; Gemini fallback) → `POST /api/trace` per claim: search dep → fetch top 2 pages dep → extract text (`@mozilla/readability` + `jsdom`, 5s cap each) → Gemini judge → `SourceVerdict`. Claims stream into the UI as they resolve; the page is never blocked on the slowest claim. Cap: 8 claims per document (state the cap in the margin).

**Map (N°02):** question → search dep (n=8) → fetch+extract each (parallel, capped) → Gemini stance-clustering into `StanceCluster[]` (one call, all extracts) → `graph.ts` → Cytoscape render. Node color = pigment by cluster; edge type = agrees/disputes; margin lists each cluster's `evidenceKind`.

**Begriffs (N°03):** NO runtime pipeline. `scripts/harvest-begriffs.ts` runs locally once against 5 seed terms (`Erfahrung, Fordismus, Rationalisierung, experience, rationalization`), century buckets 1500–1900 + 1950/2000, writes `term_snapshots`, and the page renders whatever exists — otherwise the greyed panel with the stated-limitation copy.

**Ticker:** each pipeline completion inserts an `events` row; hub subscribes via Supabase Realtime; marquee renders `N°01 · 14 CLAIMS COLLATED`. If Realtime misbehaves, poll `/api/events` every 5s — behavior identical to the audience.

---

## 6. Milestone clock (finals 4:45 PM; submission needs a public URL)

- **T+0:20** — scaffold (`create-next-app`), tokens.css + fonts in, push to GitHub, import to Vercel, env vars set. **Deployed skeleton before any feature work.** Local-first building is fine after this; every merge to `main` redeploys.
- **T+1:00** — schemas.ts frozen; DDL run; `dep.ts` + fixtures for search/fetch committed.
- **T+2:00** — Tracer end-to-end on live paste input (the one guaranteed-live flow: it needs only LLM calls).
- **T+3:00** — Map end-to-end (live or cached per ladder); hub catalogue + ticker.
- **T+3:30** — harvest script run; Begriffs panel populated or honestly greyed; ProvenanceChips everywhere.
- **T+4:00** — freeze. Demo rehearsal only. No commits after rehearsal except copy fixes.

**Demo choreography (fits checklist items 1–5):** open hub (deployed URL visible) → paste a live trending post into Tracer (real input, live) → claims + logical forms stream in → pivot to Map on a pre-cached contested question (chips say `COLLATED`) → point at N°03 and *say the limitation* → 90-second story: "readers can't see the logical anatomy of what they read; LLMs make the apparatus criticus buildable for the open web."

---

## 7. Env vars (Vercel + `.env.local`)

```
GOOGLE_GENERATIVE_AI_API_KEY=   SUPABASE_URL=   SUPABASE_SERVICE_ROLE_KEY=
HF_TOKEN=   SEARCH_API_KEY=
DEP_SEARCH_MODE=live  DEP_FETCH_MODE=live  DEP_NGRAM_MODE=cached
DEP_WIKTIONARY_MODE=cached  DEP_HF_MODE=live
```
Never commit keys; service-role key is server-only; `db.ts` must `import "server-only"`.
