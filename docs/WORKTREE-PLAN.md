# WORKTREE-PLAN.md — Parallel Build Lanes
How to run multiple Claude Code sessions concurrently without collisions, using git worktrees. One repo, one `main`, one deployment; each lane is a worktree + branch + a running Claude Code instance with a scoped charter.

> Amended 2026-08-28: lane definitions and ownership lists here remain authoritative. Everything operational is superseded by `docs/ORCHESTRATION.md` — merge mechanics by §4, setup commands and timing by §2 (worktrees are created only **after** the Phase 0 scaffold PR merges), and the opening prompts by the §5 charter blocks (the charter sketch at the bottom of this file is historical). Where a lane note below conflicts with an ORCHESTRATION §8 ruling, the ruling wins.

## Setup (A runs once, ~3 min — **after** the Phase 0 scaffold PR merges; see ORCHESTRATION §2.1–2.2 for the authoritative sequence and per-worktree steps)

```bash
cd <the existing main checkout>   # do not re-clone; worktrees fork post-scaffold main
git fetch origin && git switch main && git pull
git worktree add ../apparatus-engine  -b lane/engine
git worktree add ../apparatus-tracer  -b lane/tracer
git worktree add ../apparatus-map     -b lane/map
git worktree add ../apparatus-data    -b lane/data
git worktree add ../apparatus-design  -b lane/design
```

Open one Claude Code session per worktree directory (VS Code windows or terminal tabs). Each session reads the same CLAUDE.md/SPEC.md and receives its lane charter below as the opening prompt. Sessions never edit outside their ownership list; anything cross-cutting becomes a note in `docs/HANDOFF.md` instead of an edit.

## Lanes

**Lane A — Engine (merge first, blocks everyone).**
Owns `lib/engine/*` (except `graph.ts` — Lane C), `lib/db.ts`, `lib/env.ts`, the DDL *text* (execution in the SQL editor is A-the-human's checkpoint, ORCHESTRATION §10), `app/api/*` route shells.
Charter: implement schemas.ts exactly as SPEC §3; `dep.ts` ladder as SPEC §4; `llm.ts` with content-hash caching and the one-repair-pass rule. Definition of done: `POST /api/extract` returns valid `Claim[]` for a pasted paragraph, and `dep()` demonstrably falls live→cached→fixture when the network is disabled.

**Lane B — Tracer UI (N°01).**
Owns `app/tracer/*`. Consumes engine routes only through the SPEC types; until Lane A merges, builds against `fixtures/` responses.
Charter: paste box → streaming claim list → logical-form compartments → verdict states with ProvenanceChips. Apparatus anatomy per CLAUDE.md (folio header, margin, colophon).

**Lane C — Map UI (N°02) + graph.**
Owns `app/map/*`, `components/OntologyGraph.tsx`, `lib/engine/graph.ts` (the one shared-file exception — coordinate with Lane A via HANDOFF note before touching).
Charter: question input → cluster graph → margin cluster inventory. Pigment palette from tokens only.

**Lane D — Data & fixtures.**
Owns `scripts/*`, `fixtures/*`, and the demo inputs. Much of this can run inside claude.ai/Cowork rather than Claude Code — it is research and JSON curation, not app code.
Charter: pick the 3 demo inputs (1 trending post for Tracer live, 2 contested questions for Map), produce search/fetch/LLM fixtures for each, run `harvest-begriffs.ts` for the 5 seed terms, eyeball the etymology output, seed the DB.

**Lane E — Design integration + hub.**
Owns `components/ui/*`, `app/page.tsx`, `app/begriffs/page.tsx`, `app/layout.tsx`.
Charter: tokens.css in, fonts in, FolioHeader/Colophon/Compartment/Ticker/LacunaState built as dumb presentational components; hub catalogue with live counts; ticker on 5s polling of `/api/events` (Realtime is a stretch goal only — ORCHESTRATION §8 T1). Spend v0 credits here: prompt v0 with DESIGN-BRIEF excerpts + tokens.css to generate component shells, then hand the output to this lane's Claude Code session to tokenize and harden (v0 output must pass the CLAUDE.md hex-grep check before merge).

## Merge protocol

Order: **A → E → B → C → D** for each lane's *first* merge (engine unblocks everything; design components unblock both tool UIs). Merge cadence: every lane lands something inside each milestone window (SPEC §6) — no lane goes more than ~45 min without merging; small ugly merges beat one heroic one. Conflict rule: schemas.ts conflicts are decided by SPEC §3 verbatim; if SPEC is wrong, fix SPEC first, then code.

**Mechanics superseded:** merges to `main` are no longer direct pushes by A. Every merge is a pull request that passed the smoke gate, squash-merged by A, followed by the rebase choreography — see `docs/ORCHESTRATION.md` §4.

## Charters — how to prompt each session

Superseded: open each session with its verbatim charter block from `docs/ORCHESTRATION.md` §5 — those include the read list (this file *and* ORCHESTRATION), the ownership carve-outs, the PR/rebase protocol, and the ask escalation. Keep sessions long-lived; do not re-explain the project — the documents are the memory.
