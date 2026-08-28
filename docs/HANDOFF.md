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
