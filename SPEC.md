# SPEC.md — Apparatus Build Specification, v2
**A digital-humanities instrument suite for early-20th-century textual research.**
Status: governing. v1 (the DevFestDC 2026 buildathon spec) is superseded as of 2026-08-30 by A's rescope decision (HANDOFF DECISIONS LOG). Changes still require A's sign-off. Claude Code: read this file, `CLAUDE.md`, `DESIGN-BRIEF.md`, and `docs/DATA-CAVEATS.md` (both addenda) before writing code.

---

## 0. What we are building (90 seconds)

**Apparatus** is one deployed Next.js application: a hub catalogue and five working instruments forming a first-round workflow for research on early-20th-century texts (English and German) — OCR the source, anatomize its arguments, map the disagreement, trace the concepts, chart the people.

| N° | Instrument | One-line function |
|----|-----------|-------------------|
| 00 | **Scriptorium** | Page image → transcription via a hot-swappable HF vision model (print/handwriting, EN/DE) → saved to the corpus |
| 01 | **Tracer** | Text (pasted or a corpus document) → atomic claims → logical form → evidence status (Sourced / Weakly Sourced / Untraceable) |
| 02 | **Map** | Contested question + selected sources (corpus documents or web search) → stances clustered → typed disagreement graph |
| 03 | **Begriffs** | Term → etymology chain + frequency panel, EN/DE, century intervals 1500–1900 plus decade resolution 1890–1950 |
| 04 | **Prosopon** | Named entities recognized across the corpus → typed co-occurrence network (person / place / org / work / concept) |

The connective tissue is the **corpus**: Scriptorium (and Tracer's paste box) write `documents` rows; Tracer, Map, and Prosopon read them. Every externally-derived datum still carries a ProvenanceChip; every empty or failed state is still a state, not a crash.

**Non-goals (round 1):** auth/user accounts, IIIF ingestion, batch/queued OCR, entity disambiguation across name variants, editing OCR output beyond a plain textarea before save, mobile layouts, any second graph library, RLS.

---

## 1. Stack (decided — do not relitigate)

- **Next.js (App Router) + TypeScript**, single app, single Vercel project, Fluid compute. `maxDuration = 60` on every LLM- or OCR-touching route.
- **Styling:** Tailwind utilities on `tokens.css` custom properties; tokens.css is the only file with color/font/radius literals.
- **DB:** Supabase via `lib/db.ts` only (`import "server-only"`, service-role key). **Round 1 adds NO tables and NO columns** — see §3b storage mapping.
- **LLM primary:** Gemini via Vercel AI SDK (`ai@7` + `@ai-sdk/google`), `generateText` + `Output.object`, model id from `GEMINI_MODEL` (ruling T10).
- **LLM secondary + OCR:** the Hugging Face Inference Providers router (OpenAI-compatible chat completions). Text: `HF_FORMALIZER_MODEL`. **Vision/OCR: `HF_OCR_MODEL`, overridable per request** — swapping OCR models is a string change, never a code change (live-verified 2026-08-30, DATA-CAVEATS addendum 2).
- **Graph:** Cytoscape.js, one shared `<OntologyGraph>`, pigment palette from `--chart-*` in fixed order.
- **Validation:** zod everywhere external data enters; one repair re-prompt, then the ladder. All LLM output schemas flat (no `z.union` — Gemini rejects it).
- **No new npm dependencies** for round 1 — images travel as base64 data URLs; no image library server-side.

---

## 2. Repository layout (delta from v1)

```
app/
  page.tsx                 ← hub catalogue: FIVE compartment cells + ticker
  scriptorium/page.tsx     ← N°00 UI (upload, model picker, transcription)
  tracer/page.tsx          ← N°01 UI
  map/page.tsx             ← N°02 UI
  begriffs/page.tsx        ← N°03 UI (now a full instrument)
  network/page.tsx         ← N°04 UI (Prosopon)
  api/
    ocr/route.ts           ← image → OcrResult (HF vision, swappable)
    ner/route.ts           ← text/documentId → Entity[]
    documents/route.ts     ← corpus list (GET) / create (POST)
    terms/route.ts         ← term_snapshots read for Begriffs
    extract|formalize|trace|stance|events|health  ← as v1
```
Everything else is as v1 §2. Ownership: see ORCHESTRATION §2.3 (v2 table).

---

## 3. Data contracts (`lib/engine/schemas.ts`)

v1 types are unchanged: `Claim`, `LogicalForm`, `SourceVerdict`, `StanceCluster`, `SourceDoc`, `TermSnapshot`, `TickerEvent`, `DepMode`, `Lacuna`, `DepResult`. v2 adds (flat, zod-first, Lane A sole committer):

```ts
OcrResult = { documentId, text, model: string,          // exact HF model id used
              script: "print" | "handwriting", language: "en" | "de" | "mixed",
              pageNote?: string }                        // model's own caveat, e.g. "right column cropped"
Entity    = { id, documentId, name, kind: "person" | "place" | "org" | "work" | "concept",
              mentions: number }                         // count within the document
DEP_NAMES += "ocr", "ner"                                // two new ladder rungs
```

`EntityEdge` is NOT a stored type: co-occurrence edges are derived in `lib/engine/graph.ts` from `Entity[]` grouped by document (two entities in the same document = one weighted edge).

## 3b. DDL — **unchanged**; round-1 storage mapping

The six v1 tables stand exactly as deployed. New data maps onto them (ruling T12):

| Datum | Where it lives |
|---|---|
| OCR transcription | `documents` (`raw_text` = transcription, `source_url` = image origin or `scriptorium:<sha>`, `tool` = `"scriptorium"`) |
| OCR result metadata (model, script, language) | `dep_cache` (`dep='ocr'`, key = image content hash, payload = OcrResult) |
| NER output | `dep_cache` (`dep='ner'`, key = document content hash, payload = Entity[]) |
| Begriffs decade rows | `term_snapshots` (year_bucket carries decades 1890–1950 alongside the century buckets) |

A dedicated `entities` table is a round-2 item and requires amending this section first, plus A running the DDL in the Supabase SQL editor.

---

## 4. The dependency ladder (unchanged pattern, two new deps)

`dep(name, key, liveFn)` in `lib/engine/dep.ts` as v1 §4 (live → cached → fixture → Lacuna), mode resolution per ruling T5. New registered deps:

- **ocr** — HF router vision chat completion. Timeout **50s** (live-verified: 36s for a dense page on the 30B model — ruling T13); model = request override ?? `HF_OCR_MODEL`. Fallback rung inside live: Gemini vision (same prompt), then the ladder.
- **ner** — Gemini structured output (flat Entity[] schema), `thinkingLevel: "low"`. Timeout 30s.

Env modes `DEP_OCR_MODE`, `DEP_NER_MODE` join the T5 contract (unset + key present → live; unset + keyless → fixture).

**UI rule unchanged:** every externally-derived datum renders a ProvenanceChip; the OCR chip **names the model** (`Qwen3-VL-30B · LIVE`), because which model read the page is provenance in the scholarly sense.

---

## 5. Pipelines

**Scriptorium (N°00):** drop/upload page image (JPEG/PNG, client-side downscale to ≤1600px longest edge) → `POST /api/ocr {imageDataUrl, model?, script?, language?}` → route builds a script/language-specific transcription prompt → HF vision via `dep("ocr", …)` → `OcrResult` rendered beside the image (COLLATING… while waiting) → user may edit in a plain textarea → "Fix in the record" → `POST /api/documents` (writes `documents` + `dep_cache` OCR metadata) → offer hand-offs: "Anatomize in Tracer" / "Chart in Prosopon". Model picker lists the registry from DATA-CAVEATS addendum 2; switching models re-runs the same image with a different `model` string.

**Tracer (N°01):** as v1 §5 (extract → formalize → trace per claim, cap 8, streaming) with one addition: input is EITHER a paste OR a corpus document picked from `GET /api/documents`.

**Map (N°02):** question + source pool. Pool = selected corpus documents (preferred) or web search (v1 path). `POST /api/stance {question, documentIds?}` — when `documentIds` present, extracts come from the corpus, no search dep. Clustering and graph rendering as v1.

**Begriffs (N°03):** harvest-time only, as v1, PLUS decade buckets 1890–1950 for the five seed terms; the formerly-greyed "finer sampling" toggle becomes real (century ⇄ decade). Page reads `GET /api/terms?term=…`; keeps the OCR-noise caveat and CC BY-SA credit in the colophon.

**Prosopon (N°04):** corpus documents → per-document `POST /api/ner` (content-hash cached — re-running the corpus costs one call per NEW document) → `graph.ts` merges `Entity[]` by exact name+kind into nodes (size = total mentions), edges = same-document co-occurrence (weight = documents shared) → Cytoscape. Node fill by kind from `--chart-*` in fixed order; margin lists the entity register with counts and each document's ProvenanceChip. Empty corpus → LACUNA panel pointing at Scriptorium.

**Ticker:** unchanged (polling, ruling T1). New verbs: `N°00 · PAGE FIXED IN THE RECORD`, `N°04 · ENTITIES REGISTERED`.

---

## 6. Roadmap (replaces the v1 milestone clock)

**Round 1 — the coherent suite (this build):** all five instruments pass their §6 smoke lines in fixture mode; Scriptorium + Tracer + Prosopon work LIVE end-to-end with real keys; hub shows five cells with live counts; Begriffs shows real harvest data at century + decade resolution; deployed `main` stays green.

**Round 2 — the workflow (refinement backlog, in rough order):** corpus manager view (list/tag/delete documents); Tracer corpus cross-evidence (verdicts cite other corpus documents); Fraktur- and Kurrent-tuned prompt presets + registry expansion after accuracy comparison on real scans; batch OCR; entity merging/disambiguation UI; `entities` table + DDL; exports (CSV, GEXF for Gephi); IIIF manifest ingestion.

---

## 7. Env vars (Vercel + `.env.local`)

```
GOOGLE_GENERATIVE_AI_API_KEY=   GEMINI_MODEL=gemini-3.6-flash
SUPABASE_URL=   SUPABASE_SERVICE_ROLE_KEY=
HF_TOKEN=   HF_FORMALIZER_MODEL=Qwen/Qwen3-4B-Instruct-2507:nscale
HF_OCR_MODEL=Qwen/Qwen3-VL-30B-A3B-Instruct
SEARCH_API_KEY=   SEARCH_PROVIDER=tavily   BRAVE_SEARCH_API_KEY=(optional)
DEP_SEARCH_MODE=live  DEP_FETCH_MODE=live  DEP_GEMINI_MODE=live  DEP_HF_MODE=live
DEP_OCR_MODE=live  DEP_NER_MODE=live  DEP_NGRAM_MODE=cached  DEP_WIKTIONARY_MODE=cached
```
Never commit keys; service-role key is server-only; `db.ts` must `import "server-only"`; env access only via `lib/env.ts`.
