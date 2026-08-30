# HANDOFF.md — Cross-lane queue

The only file every lane may append to — and it has **exactly one live copy**:
this file in **A's main checkout**, addressed by absolute path
(`~/Documents/GitHub/build-a-thon-dc-2026/docs/HANDOFF.md`). Lane sessions
read and append that path directly (the one sanctioned exception to "stay in
your worktree"); never the copy inside your own worktree, which is a stale
snapshot. Only A commits this file. Keep entries to one line each; the
orchestrator polls roughly every 15 minutes (docs/ORCHESTRATION.md §7). Never
put a key, token, or URL-with-secret in this file — name the env var you need
and the orchestrator delivers it out-of-band.

## ORCHESTRATOR QUEUE

Append-only. `TYPE` is one of `KEY` (need a credential/env var), `DECISION`
(need a call only A can make), `MERGE` (PR ready for review), `BLOCKED`
(blocked >10 min, moving to next charter item).

| Time | Lane | Type | Ask (one line) | Status |
|------|------|------|----------------|--------|
| —    | —    | —    | *(example: `13:40 · D · KEY · need SEARCH_API_KEY in my .env.local to record live search fixtures` — note: only lanes A and D ever file KEY rows; B/C/E are keyless by design)* | open |
| 00:58 | tracer | MERGE | PR #6 `[lane-tracer] Scriptorium page — image intake + transcription flow` — build/smoke/hex-grep/ownership green, evidence in PR body | done |
| 00:58 | tracer | DECISION | not blocking, FYI: Scriptorium's transcription/save calls degrade `/api/ocr` and `/api/documents` 404s to LACUNA today (those routes are Lane A v2 items 3–4 not yet on `main`); `OcrResult` is mirrored locally in `app/scriptorium/ocr-client.ts` verbatim from SPEC §3 and marked `LACUNA(lane-tracer)` — will swap to the real `lib/engine/schemas.ts` import the moment Lane A merges it, no ask needed | done |
| 01:17 | D | DECISION | reference corpus pick (charter item 1) — EN print: EB1911 Vol.22 p.916 "RATIONALISM" (upload.wikimedia.org, thumb of EB1911_-_Volume_22.djvu page933); DE Antiqua: "Die Kunst" Bd.4 (1899, IA `diekunstmonatshe04mnuoft`) leaf n20, running text on the 1900 Paris Buchgewerbe-Ausstellung; DE Fraktur: "Die Gartenlaube" (1899) p.880 (commons `Die_Gartenlaube_(1899)_0880.jpg`), start of "Ueber Nervenschutz und Nervenstärkung." All pre-1930, public domain in the US, verified by visual inspection (plain running text, not plates). Proceeding to produce transcriptions unless overruled. | done |
| 01:17 | D | BLOCKED | `fixtures/ocr/*` and `fixtures/ner/*` (charter item 1) need `OcrResult`/`Entity` + `ocr`/`ner` in `lib/engine/schemas.ts` (Lane A charter item 1, not yet merged — confirmed empty on origin/main) before I can register them in `scripts/seed-fixtures.ts` without redeclaring a local schema (CLAUDE.md eng rule 1). Producing the transcriptions now via a direct HF router call (script-local, same pattern as the ngram/wiktionary harvest) and staging them under `scripts/.staging/` — will move into `fixtures/` + register the moment schemas.ts lands. Moving to charter item 3 (harvest-begriffs) meanwhile. | done |
| 01:42 | map | MERGE | PR #5 `[lane-map] graph.ts v2 entity co-occurrence + OntologyGraph hardening` — build/smoke/hex-grep/ownership green, evidence in PR body. Per the in-flight rule I kept building on `lane/map` as local-only commits while this is open: `app/map/**` corpus-multi-select + live `/api/stance` wiring, and the new `app/network/**` Prosopon page (N°04) — both build clean and smoke green locally, will rebase-and-push as PR #2/#3 the moment #5 merges. | done |
| 02:05 | tracer | DECISION | found a real bug in PR #6's own diff (comment posted on the PR): once a transcription existed, both "Transcribe" and "Fix in the record" rendered as rubricated primary buttons at once — DESIGN-BRIEF rule 4 violation. Fix is local-only (commit `8ed7df1`, per in-flight rule, not pushed). Your call: hold #6 for the fix, or merge as-is and I'll rebase a follow-up fix PR right after. Meanwhile finished the full Tracer N°01 core loop (extract→formalize→trace, per-claim parallel resolution, logical-form + verdict compartments, corpus picker) as local-only commits, build/lint/smoke all green, will push + open PR the moment #6 merges. | done |

## CROSS-LANE NOTES

Anything one lane needs another lane to know or do — including every proposed
change to a shared file (`lib/engine/schemas.ts`, `lib/engine/graph.ts`,
`tokens.css`). The owning lane commits the change; the requesting lane never
edits across the boundary.

- 2026-08-30 · map (C) · CROSS-LANE: touching `lib/engine/graph.ts` — adding
  `entitiesToElements(Entity[])` + `ENTITY_KIND_ORDER` for the Prosopon
  co-occurrence graph (SPEC §5 N°04). Additive only: `stanceClustersToElements`
  and its exports are unchanged, still client-safe (no env/db). `Entity` isn't
  in `schemas.ts` yet (Lane A charter item 1), so graph.ts carries a local
  `// LACUNA(lane-map)`-marked interface mirroring SPEC §3's Entity shape
  verbatim; will swap to `import type { Entity } from "./schemas"` the moment
  Lane A merges it — no ask needed, just flagging the interim shape so nobody
  is surprised by it in a diff.

## DECISIONS LOG

Every DECISION resolved by A gets one line here so late-starting sessions (or
humans, in manual mode) inherit it without archaeology.

- 2026-08-28 · Merge mechanics are PR-gated per ORCHESTRATION §4 (supersedes WORKTREE-PLAN direct merges).
- 2026-08-30 · **SPEC v2 rescope (A):** buildathon over; product is now a five-instrument DH suite for early-20th-c. textual research — Scriptorium N°00 (OCR, swappable HF VLM), Tracer N°01, Map N°02 (corpus-first), Begriffs N°03 (promoted, decade resolution), Prosopon N°04 (NER network). Nothing cut; three rescoped, two added.
- 2026-08-30 · OCR mechanism live-verified: HF router VLMs via chat completions; pin `HF_OCR_MODEL=Qwen/Qwen3-VL-30B-A3B-Instruct` (36s dense page), fast-draft `google/gemma-3-27b-it` (4s). Dedicated OCR models are NOT on the router. Details: DATA-CAVEATS addendum 2.
- 2026-08-30 · Zero new DDL round 1 (ruling T12): OCR/NER data maps onto documents + dep_cache.
- 2026-08-30 · Hub renders five catalogue cells (ruling T11, supersedes T8's three).
- 2026-08-30 · Production exists at `build-a-thon-dc-2026-adm-2ks-projects.vercel.app` but sits behind Vercel Authentication (302) — ASK for A-the-human: toggle Settings → Deployment Protection off when a public URL is wanted. This machine's network blocks `*.vercel.app`; production checks run via the prodcheck GitHub Action.
- 2026-08-30 · Lane sessions relaunched post-rescope; original 2026-08-28 sessions died on session limits with zero commits (lane branches were clean at the scaffold merge — nothing lost).
- 2026-08-30 · First-merge order (§4.2) interpreted for the v2 relaunch: engine's first PR gates everything (merged #4 first); the design-lane-second rule is not allowed to stall ready, gate-clean B/C/D PRs — E rebases like everyone else.
- 2026-08-30 · Lane D reference corpus APPROVED: EB1911 Vol.22 "RATIONALISM" (EN print) · Die Kunst Bd.4 1899 (DE Antiqua) · Die Gartenlaube 1899 p.880 (DE Fraktur) — all pre-1930 public domain.
- 2026-08-30 · Merged: #4 engine schemas v2 (25e9d3e) → #5 graph.ts v2 (6f7fed1) → #6 Scriptorium page (7aad834). All lanes announced and rebasing.
- 2026-08-30 · prodcheck v2: probes the real production domain (…-adm-2ks-projects.vercel.app); an all-paths-302 result reports DEPLOYED-BUT-WALLED and passes until A toggles Deployment Protection off.
