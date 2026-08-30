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

## CROSS-LANE NOTES

Anything one lane needs another lane to know or do — including every proposed
change to a shared file (`lib/engine/schemas.ts`, `lib/engine/graph.ts`,
`tokens.css`). The owning lane commits the change; the requesting lane never
edits across the boundary.

- *(none yet)*

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
