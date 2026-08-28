# HANDOFF.md — Cross-lane queue

The only file every lane may append to. Three sections, three purposes. Keep
entries to one line each; the orchestrator polls this file roughly every 15
minutes (docs/ORCHESTRATION.md §7). Never put a key, token, or URL-with-secret
in this file — name the env var you need and the orchestrator delivers it
out-of-band.

## ORCHESTRATOR QUEUE

Append-only. `TYPE` is one of `KEY` (need a credential/env var), `DECISION`
(need a call only A can make), `MERGE` (PR ready for review), `BLOCKED`
(blocked >10 min, moving to next charter item).

| Time | Lane | Type | Ask (one line) | Status |
|------|------|------|----------------|--------|
| —    | —    | —    | *(example: `13:40 · B · KEY · need DEP_SEARCH_MODE=live + SEARCH_API_KEY in my .env.local to test real queries`)* | open |

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
