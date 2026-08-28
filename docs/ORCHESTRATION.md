# ORCHESTRATION.md — Agent Coordination & Build Protocol

**DevFestDC 2026 · Apparatus · process authority.**
`SPEC.md` is authoritative for the *product* (what gets built). This document is
authoritative for the *process* (how work happens, who touches what, how code
reaches `main`, what the human does). When a document disagrees with SPEC about
product, SPEC wins; when one disagrees with this file about process, this file
wins. Amendments to this file are A's call, logged in `docs/HANDOFF.md`
DECISIONS LOG.

Written 2026-08-28. Dependency facts in §1 were web-verified on that date.

---

## 0. The one-page mental model

- **One repo, one `main`, one Vercel deployment.** `main` is always deployable;
  every squash-merge to `main` redeploys production.
- **Five lanes** (A engine · B tracer · C map · D data · E design/hub), each =
  one git worktree + one long-lived branch + one Claude Code session running a
  scoped charter (§5). Ownership is disjoint by construction (§2), so parallel
  work cannot conflict unless someone breaks the contract.
- **Phase 0 is an Ultracode scaffold run** (§3) that lands the entire skeleton
  as one reviewed PR *before* lanes open. Lanes never scaffold; they fill in.
- **Every merge is a PR** that passed the smoke gate (§4, §6). After every
  merge, all open lanes rebase immediately — many trivial rebases beat one
  heroic end-of-day rebase.
- **The human orchestrator (A) has exactly three jobs:** credentials & env
  (§1), PR review & merge (§4), and unblocking asks from the HANDOFF queue
  (§7). Everything else is delegated to lane sessions.
- **Documents are the memory.** Any session can die; the docs plus the lane
  branch must be enough for a fresh session — or a human, once tokens run out
  (§9) — to resume any lane without re-explanation.

---

## 1. Orchestrator credential queue

The single highest-leverage fact in this plan: **fixture-first development means
lanes B, C, and E need zero credentials, ever.** They run `DEP_*_MODE=fixture`
against committed JSON. Only Lane A (engine) and Lane D (data) touch live
services. Therefore the orchestrator acquires keys in the order that unblocks
Lane A end-to-end first, and everything else can be fetched *while agents are
already building*.

**Distribution protocol:** keys live in exactly two places — the Vercel
project's environment variables and `.env.local` files that A copies into
worktrees that need live mode. Never committed, never pasted into HANDOFF.md,
chat transcripts, or commit messages. An agent that needs a key writes a `KEY`
row to the HANDOFF queue naming the env var; A delivers by editing that
worktree's `.env.local` directly.

### 1.1 The queue (acquire in this order; caps and sources live in the DATA-CAVEATS addendum)

| # | Service | Time | Unblocks | Env vars | Card? |
|---|---------|------|----------|----------|-------|
| P0-1 | **Google AI Studio** (Gemini) | ~5 min | Lane A end-to-end; the one guaranteed-live demo flow | `GOOGLE_GENERATIVE_AI_API_KEY` | no (card only for the $10 Tier 1 rate-limit insurance) |
| P0-2 | **Supabase** (new project, US-East) | ~5 min + provisioning | DDL, `db.ts`, dep_cache, events | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (holds the new `sb_secret_…` value) | no |
| P0-3 | **Vercel** (import repo, env, protection decision) | ~10 min | the T+0:20 deployed skeleton; the judge-facing URL | all of them, set before first deploy | no |
| P0-4 | **Tavily** (primary search) | ~5 min | `/api/trace`, Map source pool | `SEARCH_API_KEY` (`tvly-…`), `SEARCH_PROVIDER=tavily` | no |
| P0-5 | **Hugging Face PRO + token** | ~10 min | formalizer route | `HF_TOKEN`, `HF_FORMALIZER_MODEL` | **yes** ($9 PRO — free tier hard-blocks at $0.10) |
| P1-6 | Brave Search (fallback only) | ~10 min | search failover | `BRAVE_SEARCH_API_KEY` | yes |
| P1-7 | v0 credits (Lane E shells) | — | optional | — | — |
| — | Ngram · Wiktionary · readability | 0 | Lane D harvest | `DEP_*_MODE` only | no key exists |

Google Programmable Search is **off the menu** — closed to new customers,
discontinued 2027 (addendum §1). The SPEC §7 var list is extended by four
addendum vars: `SEARCH_PROVIDER`, `BRAVE_SEARCH_API_KEY` (optional),
`HF_FORMALIZER_MODEL`, and `DEP_GEMINI_MODE` (§8 T5).

### 1.2 Per-credential smoke test (run each the moment you hold the key)

A credential is not "acquired" until its smoke line returns 200 — a key that
was never exercised is a demo-time landmine.

Every line prints its HTTP status — "no output" is a hang, not a pass.

```bash
# P0-1 Gemini — expect 200 and a models list
curl -s -w '\nHTTP %{http_code}\n' \
  "https://generativelanguage.googleapis.com/v1beta/models?key=$GOOGLE_GENERATIVE_AI_API_KEY" | tail -c 400

# P0-2 Supabase — the SPEC §3b DDL runs at T−1 (§10), so the events table
# exists. Insert (expect 201 + the echoed row), then read back (expect 200).
curl -s -w '\nHTTP %{http_code}\n' "$SUPABASE_URL/rest/v1/events" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"instrument":"01","verb":"SMOKE"}'
curl -s -w '\nHTTP %{http_code}\n' "$SUPABASE_URL/rest/v1/events?select=*&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# P0-3 Vercel: verified in two steps — at T+0: import + env vars entered;
# right after the scaffold PR merges: the PRODUCTION URL renders the hub.
# Also confirm the preview-protection decision by opening any preview link
# in a logged-out window.

# P0-4 Tavily — expect 200 + results[]
curl -s -w '\nHTTP %{http_code}\n' https://api.tavily.com/search \
  -H "Authorization: Bearer $SEARCH_API_KEY" -H "Content-Type: application/json" \
  -d '{"query":"nuclear power decarbonization","max_results":3}' | tail -c 500

# P0-5 Hugging Face (also the DATA-CAVEATS warm-up call — time it; <3s keeps the pin)
time curl -s -w '\nHTTP %{http_code}\n' https://router.huggingface.co/v1/chat/completions \
  -H "Authorization: Bearer $HF_TOKEN" -H "Content-Type: application/json" \
  -d "{\"model\":\"$HF_FORMALIZER_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Return the JSON {\\\"ok\\\":true}\"}],\"max_tokens\":16}"
```

### 1.3 Service specifics the orchestrator must not learn at 4:40 PM

- **Gemini:** key from https://aistudio.google.com/apikey (~5 min; note which
  GCP project it lands in — limits are per project, not per key). While logged
  in, read the *actual* free-tier RPM/TPM/RPD for `gemini-2.5-flash` from
  https://aistudio.google.com/rate-limits and write them into the DATA-CAVEATS
  addendum — Google no longer publishes them (third-party consensus: ~10 RPM /
  250 RPD, which one judge-requested rerun can exhaust). **The mid-build
  escape hatch is a $10 Tier 1 prepay on the same project ("Set up billing" on
  the key's project): same key, no env change, near-instant, ~30× RPM** — the
  old GCP-credits plan no longer works. Do it before 4:00 PM if the demo
  matters; rehearse with the exact demo inputs so finals hits the content-hash
  cache and costs zero quota.
- **Supabase:** new projects issue `sb_publishable_`/`sb_secret_` keys, not
  anon/service_role. The `sb_secret_` key goes in `SUPABASE_SERVICE_ROLE_KEY`
  unchanged (drop-in for `createClient`). Keys: Settings → API Keys (create
  the secret key if none listed; shown once). SQL editor for the SPEC §3b DDL:
  left sidebar → SQL Editor. Region: US-East, nearest Vercel `iad1`.
- **Vercel:** set ALL env vars on the import screen *before* first deploy;
  later changes need a redeploy (~1–3 min, one build slot) — which is also why
  every `DEP_*_MODE` flip must be rehearsed once before finals. Decide the
  preview-protection policy on day one: default-on Vercel Authentication means
  **judges hit a login wall on any preview URL** — share only the production
  domain, or toggle protection off (Settings → Deployment Protection).
- **Tavily:** key is on the dashboard immediately after signup; 100 req/min on
  the free dev tier absorbs the 8-claim parallel burst. Record the remaining
  credits number into the DATA-CAVEATS addendum at build start.
- **Hugging Face:** upgrade to PRO *before* event day (free tier hard-blocks
  mid-day); create the fine-grained token with the "Make calls to Inference
  Providers" permission via the deep link in the addendum. The formalizer pin
  lives in `HF_FORMALIZER_MODEL` — if the warm-up call exceeds 3s, swap the
  env var (bare id → router picks fastest provider), never the code.

---

## 2. Repo & worktree topology

### 2.1 Setup (A runs once, after the Phase 0 scaffold PR merges)

```bash
cd ~/Documents/GitHub/build-a-thon-dc-2026     # the main checkout — A's, and the only one that merges
git fetch origin && git switch main && git pull

git worktree add ../apparatus-engine  -b lane/engine
git worktree add ../apparatus-tracer  -b lane/tracer
git worktree add ../apparatus-map     -b lane/map
git worktree add ../apparatus-data    -b lane/data
git worktree add ../apparatus-design  -b lane/design
```

### 2.2 Per-worktree checklist (each worktree is a separate filesystem tree)

| Step | Command / rule |
|---|---|
| Install deps | `pnpm install` — `node_modules` is **not** shared between worktrees |
| Env | `cp .env.example .env.local` — UI lanes keep fixture modes and no keys |
| Publish branch | `git push -u origin lane/<lane>` — once, immediately, so every later `--force-with-lease` and `gh pr create` has an upstream |
| Dev port | `pnpm dev -p <port>` — A:3001 · B:3002 · C:3003 · D:3004 · E:3005 (main checkout keeps 3000) |
| Session | Open one Claude Code session rooted in the worktree; opening prompt = the lane's charter block from §5, verbatim |
| Never | `cd` into another worktree, edit outside the ownership map, or run `git push` to `main`. One deliberate exception: the HANDOFF queue is read and appended **only** at its single live path in A's main checkout (§7) |

### 2.3 Ownership map (the collision contract)

| Lane | Branch | Owns (globs) | Shared-file exceptions |
|---|---|---|---|
| A — Engine | `lane/engine` | `lib/engine/**` (except `graph.ts`), `lib/db.ts`, `lib/env.ts`, `app/api/**`, the DDL *text* (SPEC §3b — execution in the SQL editor is the human's §10 checkpoint) | sole committer of `lib/engine/schemas.ts` |
| B — Tracer | `lane/tracer` | `app/tracer/**` | — |
| C — Map | `lane/map` | `app/map/**`, `components/OntologyGraph.tsx`, `lib/engine/graph.ts` | `graph.ts` changes announced via HANDOFF before touching |
| D — Data | `lane/data` | `scripts/**`, `fixtures/**` | — |
| E — Design/Hub | `lane/design` | `components/ui/**`, `app/page.tsx`, `app/layout.tsx`, `app/begriffs/**`, `app/globals.css` | `tokens.css` is frozen — changes require A sign-off |

**Enforcement rule:** before every PR, run
`git diff --name-only origin/main` — any file outside your globs is a defect
unless a CROSS-LANE note in HANDOFF authorizes it. Docs (`docs/*.md`) are
append-open to all lanes for HANDOFF, and A-only for the rest.

---

## 3. Phase 0 — the Ultracode scaffold

**When:** starts at T+0:00. SPEC §6's frozen T+0:20 milestone covers only the
*minimal deployed skeleton* (base app + tokens pushed, Vercel import done, env
set); the **full** skeleton below realistically lands, gated and merged, by
**~T+1:00** — plan the morning around that, not around 20 minutes.
**Where:** A's main checkout, branch `scaffold/init`. **How:** one Claude Code
session with ultracode enabled runs the workflow script in **Appendix A** (the
Phase 0 charter above the script is the session's opening prompt). The
workflow fans out agents over disjoint path groups, then loops a verify-fix
cycle until the acceptance gate is green.

**The scaffold PR lands, in one commit:**

1. `create-next-app` skeleton — pnpm, TypeScript, Tailwind, App Router — plus
   pinned deps: `ai`, `@ai-sdk/google`, `zod`, `@supabase/supabase-js`,
   `cytoscape`, `@mozilla/readability`, `jsdom`, `server-only`.
2. `tokens.css` imported first in `app/layout.tsx`; Google Fonts link per
   DESIGN-BRIEF §4; `<body>` on `var(--stock)`.
3. `lib/engine/schemas.ts` — every SPEC §3 type as a zod schema + inferred TS
   type, verbatim. This file is the inter-lane interface; it merges frozen.
4. `lib/env.ts` — zod-validates all env vars at boot under the **mode
   resolution ruling (§8 T5)**: an explicit `DEP_<X>_MODE` value always wins;
   an *unset* mode resolves to `live` when its credential is present and to
   `fixture` when it is absent; a key is required only when the resolved mode
   needs it. `DEP_GEMINI_MODE` joins the contract (fixture returns canned
   `Claim[]`/`StanceCluster[]` — the DATA-CAVEATS §3 floor). This — not
   SPEC §4's bare default-live — is what makes keyless lanes and the keyless
   smoke gate satisfiable; production sets every mode explicitly anyway.
5. `lib/engine/dep.ts` — the SPEC §4 ladder with fixture mode fully working;
   `lib/engine/llm.ts` — `gemini()`/`hf()` callers, content-hash cache, one
   repair pass; `lib/db.ts` — `import "server-only"`, typed table helpers that
   no-op with a console warning when Supabase vars are absent.
6. All six route shells (`extract`, `formalize`, `trace`, `stance`, `events` +
   one health route) with zod request validation, `maxDuration = 60`, returning
   fixture-shaped data through `dep()`.
7. Dumb presentational primitives: `FolioHeader`, `Colophon`,
   `ApparatusMargin`, `Compartment`, `ProvenanceChip`, `Ticker`, `LacunaState`;
   an `OntologyGraph` shell that renders fixture elements.
8. `fixtures/` tree with at least one schema-valid placeholder per dependency;
   `scripts/seed-fixtures.ts` and `scripts/harvest-begriffs.ts` as typed stubs;
   `scripts/smoke.sh` (§6).
9. Placeholder pages for `/`, `/tracer`, `/map`, `/begriffs` — folio header,
   apparatus margin, colophon, `LACUNA` empty states. Ugly is fine; anatomy is
   mandatory.
10. `vercel.json` with an **Ignored Build Step** so only `main` deploys:
    `{"ignoreCommand": "[ \"$VERCEL_GIT_COMMIT_REF\" != \"main\" ]"}` —
    `ignoreCommand` exiting **0 skips** the build, **1 proceeds**, so this
    skips every non-main ref and builds `main`. Without it, every lane
    force-push triggers a preview build — at the mandated §4 cadence that is
    ~140 deployments against Hobby's verified 100/day cap and one concurrent
    build slot, and by mid-afternoon production deploys queue behind junk
    previews.

**Acceptance gate — pre-merge (the scaffold PR merges only when all four hold):**

- `pnpm build` green locally.
- `scripts/smoke.sh` green **with no `.env.local` present at all** — proving
  the keyless fixture path lanes B/C/E depend on.
- Hex grep clean (no color/font/radius literals outside `tokens.css`).
- Repo imported to Vercel with every env var entered. (Production deploys
  from `main`, so it cannot render the hub *before* this PR merges — do not
  wait for it to; the first docs-only deploy showing nothing is expected.)

**Post-merge, immediately:** the production URL renders the hub. If it does
not within one build cycle, `git revert` the squash commit (§4.3) and fix on
the branch — never fix forward on a red `main`.

After the merge, A creates the five worktrees (§2.1) *from post-scaffold
`main`* and opens the lane sessions. From this moment the repo is in normal
protocol (§4).

---

## 4. Branch, PR & rebase protocol

### 4.1 Branch topology

- Exactly **one long-lived branch per lane** (`lane/engine`, `lane/tracer`,
  `lane/map`, `lane/data`, `lane/design`) — worktrees are bound to them.
- `scaffold/init` (Phase 0, dies after merge) and `hotfix/*` (A only, for a red
  `main`) are the only other branches.
- **One feature per PR, one agent per branch.** A lane emits a PR the moment a
  charter line-item passes its smoke test — never batch two features. Features
  are serialized *within* a lane and parallel *across* lanes.
- **The in-flight rule:** the moment you open a PR, record its tip —
  `PR_HEAD=$(git rev-parse HEAD)` — and **do not push to your lane branch
  again until A announces the merge** (a push to the branch silently adds
  unreviewed work to the open PR, and every `main` merge deploys production).
  Keep working: commit the next feature *locally* and reconcile after the
  merge per §4.3.

### 4.2 The PR gate

PR title: `[lane-x] <feature>`. The template
(`.github/pull_request_template.md`) enforces: build green · lane smoke
evidence pasted · hex grep clean · ownership clean · rebased on current
`origin/main` · `maxDuration` on new LLM routes · `ProvenanceChip` on new
external data · no secrets in diff · SPEC amended first if a data contract
changed. **A is the only merger**, and merges are **squash-merges only** —
`main` stays linear, one commit per feature, so revert and bisect stay trivial
and rebases stay cheap.

First-merge order gate: A's first PR → E's first PR → B/C/D in any order
(engine unblocks everyone; design primitives unblock both tool UIs). After each
lane's first merge, cadence is free — but no lane goes more than ~45 minutes
without landing something (WORKTREE-PLAN).

### 4.3 Rebase choreography (the rule that makes the end of day painless)

- **After YOUR PR squash-merges** (using the `PR_HEAD` you recorded at
  PR-open, §4.1):
  `git fetch origin && git rebase --onto origin/main "$PR_HEAD" && git push --force-with-lease`
  This replants **only** the local commits you made *after* opening the PR
  onto the new `main`; when there are none, it is exactly a
  `reset --hard origin/main`. Never plain-rebase your own squash-merged
  commits — squash changes patch identity and manufactures phantom conflicts
  — and never `reset --hard` if you committed anything after PR-open: reset
  destroys those commits (reflog-only recovery). The push updates
  `origin/lane/<x>` so your next `gh pr create` isn't rejected
  non-fast-forward.
- **After ANY OTHER lane merges:**
  `git fetch origin && git rebase origin/main && git push --force-with-lease`
  Within 15 minutes of the merge announcement, or before your next commit,
  whichever comes first. Disjoint ownership makes this a clean fast rebase in
  the normal case. **If the rebase is NOT clean, that is a signal, not a
  chore:** someone crossed an ownership boundary. Stop, `git rebase --abort`,
  write a `BLOCKED` HANDOFF row, and let A adjudicate — never resolve a
  cross-lane conflict silently.
- Force-push discipline: `--force-with-lease` always, never plain `--force`,
  never any force-push to `main`.
- **Red `main` = all-lanes-stop.** A reverts the offending squash commit
  (`git revert <sha>` — trivial because `main` is linear) rather than
  fixing forward under pressure. Lanes rebase past the revert and continue.

### 4.4 Shared-file protocol

`lib/engine/schemas.ts`, `lib/engine/graph.ts`, and `tokens.css` are the three
files two lanes could plausibly want. The protocol: the requesting lane writes
a CROSS-LANE note (what + why + proposed diff), the owning lane commits it,
the requester rebases. schemas.ts disputes are decided by SPEC §3 verbatim; if
SPEC is wrong, A amends SPEC first, then the code follows.

---

## 5. Lane charters — opening prompts, verbatim

Paste one block per session, unmodified. The charters deliberately never
mention which model is running — they work identically for Fable, Opus,
Sonnet, or a human reading them as a task list (§9).

### Lane A — Engine

```text
You are Lane A (Engine) in docs/WORKTREE-PLAN.md, working in the
apparatus-engine worktree on branch lane/engine. Read CLAUDE.md, SPEC.md,
docs/DATA-CAVEATS.md, docs/WORKTREE-PLAN.md, and docs/ORCHESTRATION.md before
writing code. You own lib/engine/* EXCEPT lib/engine/graph.ts (that one file
is Lane C's — ORCHESTRATION §2.3), lib/db.ts, lib/env.ts, app/api/*, and the
DDL text in SPEC §3b (its execution in the Supabase SQL editor is the human
orchestrator's checkpoint, not yours). You are the sole committer of
schemas.ts. Never edit outside that list.

Priority order: (1) harden schemas.ts against SPEC §3 verbatim; (2) dep.ts
ladder per SPEC §4 with live→cached→fixture fallthrough demonstrably working,
under the mode-resolution ruling in ORCHESTRATION §8 T5; (3) llm.ts with
content-hash cache and the one-repair-pass rule; (4) /api/extract returning
valid Claim[] for a pasted paragraph; (5) /api/formalize (HF primary, Gemini
fallback, model-agnostic prompt); (6) /api/trace (search dep → fetch dep →
readability extract → Gemini judge); (7) /api/stance; (8) /api/events + db.ts
helpers with one retry; (9) stretch, only after 8: a read-only route or
server helper over term_snapshots so Lane E's Begriffs panel never imports
db.ts (ORCHESTRATION §8 T4).

Definition of done per item: the §6 smoke line for it passes. Emit a PR per
item (ORCHESTRATION §4) — one feature per PR, smoke evidence pasted. When an
LLM response fails zod: one repair re-prompt, then the ladder — never widen a
type. Every route exports maxDuration = 60. When you need a credential, write
a KEY row to docs/HANDOFF.md naming the env var and continue on fixture mode —
never idle waiting. When blocked >10 minutes, write a BLOCKED row and move to
the next item. After any merge to main, follow the rebase choreography
(ORCHESTRATION §4.3). Before finishing any work session, commit WIP as
`wip(lane-a): <state> — next: <step>`.
```

### Lane B — Tracer UI

```text
You are Lane B (Tracer UI, instrument N°01) in docs/WORKTREE-PLAN.md, working
in the apparatus-tracer worktree on branch lane/tracer. Read CLAUDE.md,
SPEC.md, docs/DATA-CAVEATS.md, docs/WORKTREE-PLAN.md, and
docs/ORCHESTRATION.md before writing code. You own app/tracer/** only. You
run in fixture mode with no API keys; consume engine routes strictly through
the SPEC §3 types, against committed fixtures until Lane A's routes merge.

Priority order: (1) paste box + submit per the design anatomy (folio header,
apparatus margin, colophon); (2) streaming claim list — claims render as they
resolve, never blocked on the slowest (cap 8 claims, cap stated in the
margin); (3) logical-form compartments (premises → conclusion, operator
badge); (4) verdict states Sourced / Weakly Sourced / Untraceable with
ProvenanceChips; (5) LACUNA and COLLATING… states for every async region — a
hanging spinner is a defect.

Definition of done per item: the §6 smoke line passes and the view passes the
CLAUDE.md ship checklist (tokens only, one rubricated primary action, three
theme states legible). One feature per PR with smoke evidence. Never edit
lib/**, app/api/**, or components/ui/** — request changes via a CROSS-LANE
note in docs/HANDOFF.md. When blocked >10 minutes, write a BLOCKED row and
move on. After any merge to main, rebase per ORCHESTRATION §4.3. Before
ending a session: `wip(lane-b): <state> — next: <step>`.
```

### Lane C — Map UI + graph

```text
You are Lane C (Map UI + graph, instrument N°02) in docs/WORKTREE-PLAN.md,
working in the apparatus-map worktree on branch lane/map. Read CLAUDE.md,
SPEC.md, docs/DATA-CAVEATS.md, docs/WORKTREE-PLAN.md, and
docs/ORCHESTRATION.md before writing code. You own app/map/**,
components/OntologyGraph.tsx, and lib/engine/graph.ts — the last is a shared
file: announce every graph.ts change as a CROSS-LANE note in docs/HANDOFF.md
before touching it. You run in fixture mode with no API keys.

Priority order: (1) question input + submit within the design anatomy; (2)
graph.ts: StanceCluster[] → Cytoscape elements; (3) OntologyGraph — node fill
by cluster from --chart-* in fixed order, square compartment nodes (radius 0,
1px hairline), edges in --ink-2 typed agrees/disputes, selected node ringed
in --rubric; (4) margin cluster inventory listing each cluster's evidenceKind
with ProvenanceChips; (5) LACUNA / COLLATING… states.

Definition of done per item: §6 smoke line + CLAUDE.md ship checklist. One
feature per PR with smoke evidence. Colors from tokens only — a generated hue
is a defect equal to a hex value. When blocked >10 minutes: BLOCKED row, move
on. After any merge to main, rebase per ORCHESTRATION §4.3. Before ending a
session: `wip(lane-c): <state> — next: <step>`.
```

### Lane D — Data & fixtures

```text
You are Lane D (Data & fixtures) in docs/WORKTREE-PLAN.md, working in the
apparatus-data worktree on branch lane/data. Read CLAUDE.md, SPEC.md,
docs/DATA-CAVEATS.md, docs/WORKTREE-PLAN.md, and docs/ORCHESTRATION.md. You
own scripts/** and fixtures/**. Your output is data and scripts, not app code.

Priority order: (1) choose the 3 demo inputs — one trending post for Tracer
live, two contested-but-not-gruesome questions for Map (DATA-CAVEATS §3
refusal-risk guidance) — and log them as a DECISION row for A's sign-off; (2)
search/fetch/LLM fixtures for all three inputs, schema-valid against
lib/engine/schemas.ts (validate with scripts/seed-fixtures.ts --check); (3)
extracted-text fixtures for every URL in the search fixtures; (4)
harvest-begriffs.ts run for the 5 seed terms (Erfahrung, Fordismus,
Rationalisierung, experience, rationalization) with 2s sleeps — eyeball the
etymology output before committing (DATA-CAVEATS §6); (5) seed the DB and
commit the harvest output to fixtures/ngram/.

You are the lane most likely to need live keys (KEY rows to docs/HANDOFF.md,
continue on other items while waiting). Never commit raw HTML — extracted or
derived JSON only. One feature per PR with smoke evidence
(seed-fixtures --check output). When blocked >10 minutes: BLOCKED row, move
on. Rebase per ORCHESTRATION §4.3. Before ending a session:
`wip(lane-d): <state> — next: <step>`.
```

### Lane E — Design integration + hub

```text
You are Lane E (Design integration + hub) in docs/WORKTREE-PLAN.md, working in
the apparatus-design worktree on branch lane/design. Read CLAUDE.md, SPEC.md,
DESIGN-BRIEF.md in full, docs/WORKTREE-PLAN.md, and docs/ORCHESTRATION.md.
You own components/ui/**, app/page.tsx, app/layout.tsx, app/begriffs/**, and
app/globals.css. tokens.css is frozen — changes need A's sign-off. You run
with no API keys.

Priority order: (1) harden the scaffold's primitives (FolioHeader, Colophon,
ApparatusMargin, Compartment, ProvenanceChip, Ticker, LacunaState) as dumb
presentational components to DESIGN-BRIEF §6 spec; (2) hub catalogue —
compartment cells with N°, name, one-line function, live count from
/api/events; (3) ticker on 5s polling of /api/events (Realtime is a stretch —
see ORCHESTRATION §8 T1 — polling behavior is identical to the audience); (4)
begriffs panel reading term_snapshots via an engine route if present,
otherwise the greyed LACUNA panel with the DATA-CAVEATS §5 limitation copy
verbatim; (5) FOLIO MISSING 404 page, colophon with event stamp.

If v0 credits are used for component shells: v0 output is a draft, not a
merge — tokenize it, strip every literal, and pass the hex grep before it
enters a PR. Definition of done per item: §6 smoke line + full CLAUDE.md ship
checklist including all three theme states. One feature per PR. When blocked
>10 minutes: BLOCKED row, move on. Rebase per ORCHESTRATION §4.3. Before
ending a session: `wip(lane-e): <state> — next: <step>`.
```

---

## 6. Smoke tests — what "functional" means

`scripts/smoke.sh` (landed by the scaffold) runs the global gate; each lane
adds its own checks as PR evidence. All smoke commands must pass **in fixture
mode with no keys** unless the feature under test is itself a live
integration.

### Global (every PR)

```bash
pnpm build                                    # compiles, types check
bash scripts/smoke.sh                         # the checks below, scripted
# hex/font/radius literals outside tokens.css (exit-safe form — a bare
# `grep … && exit 1` fails on a CLEAN tree, because grep exits 1 on no match):
if grep -rn --include='*.tsx' --include='*.ts' --include='*.css' \
    -E '#[0-9a-fA-F]{3,8}\b' app components lib | grep -v tokens.css | grep -q .; then
  echo 'FAIL: color literal outside tokens.css'; exit 1
fi
node scripts/seed-fixtures.ts --check         # every fixture zod-parses
```

### Per lane

| Lane | Smoke line (paste output as PR evidence) |
|---|---|
| A | `curl -s -X POST http://localhost:3001/api/extract -H 'Content-Type: application/json' -d @fixtures/demo/paragraph.json` returns zod-valid `Claim[]`; with network disabled and `DEP_SEARCH_MODE=live`, `dep('search',…)` demonstrably falls live→cached→fixture (log lines show the descent) |
| B | `/tracer` in fixture mode: paste → ≥1 claim compartment with logical form and a verdict chip renders; empty input renders `LACUNA`, never a spinner |
| C | `/map` in fixture mode: fixture question renders ≥3 cluster nodes colored by `--chart-*` order, typed edges, margin inventory present |
| D | `node scripts/seed-fixtures.ts --check` exits 0 over all fixtures; harvest output rows exist for all 5 seed terms with provenance set |
| E | `/` renders 3 catalogue cells + ticker (polling); `/tracer`, `/map`, `/begriffs`, `/` all show folio header + colophon; pages legible in forced-light and forced-dark |

The deployed URL loading after merge is part of the gate for **every** PR —
A checks it before announcing the merge.

---

## 7. The ask protocol & the orchestrator's attention loop

Agents never idle and never improvise around a blocker. The escalation path is
one file — **with exactly one live copy**: the `docs/HANDOFF.md` in **A's main
checkout**, addressed by absolute path
(`~/Documents/GitHub/build-a-thon-dc-2026/docs/HANDOFF.md`). A git-tracked
queue split across five worktree branches cannot work: a row appended on
`lane/tracer` is invisible to A until some PR merges, and five lanes appending
to the same table tail guarantees the rebase conflicts §4.3 outlaws. So: every
lane session reads and appends **that one path** (the single sanctioned
exception to "never touch outside your worktree", §2.2); **only A commits the
file**, occasionally, as a record; `.gitattributes` marks it `merge=union` as
belt-and-braces; and a HANDOFF conflict is explicitly **exempt** from §4.3's
conflict-means-boundary-violation rule. The row is the *record*; the *signal*
is A pasting one line ("merged [lane-x] <f> — rebase now" / "key delivered")
into each running session on the §7 loop.

**Ask format** (append one row to ORCHESTRATOR QUEUE):
`| HH:MM | lane | KEY / DECISION / MERGE / BLOCKED | one-line ask | open |`

Rules:

- **KEY** names the env var, never asks for the value in-file; A delivers to
  the worktree's `.env.local` out-of-band and flips the row to `done`.
- **DECISION** is for calls only A can make (SPEC amendments, scope cuts,
  shared-file disputes). A's ruling gets one line in DECISIONS LOG — late
  sessions inherit decisions by reading, not by asking again.
- **MERGE** means a PR is up with the gate satisfied. This is the row A
  services fastest, because merged code unblocks other lanes' rebases.
- **BLOCKED** documents a >10-minute blocker; the lane has already moved to
  its next charter item by the time A reads it.
- Batch asks: one row with three needs beats three rows.

**A's attention loop** (repeat ~every 15 minutes; nothing here requires
watching an agent type):

1. **Merge queue** — review `MERGE` rows: gate checklist, deployed URL check,
   squash-merge, announce (a one-line CROSS-LANE note: "merged [lane-x] <f>,
   rebase now").
2. **HANDOFF queue** — service `KEY` rows (copy to `.env.local`), rule on
   `DECISION` rows, triage `BLOCKED` rows.
3. **Milestone work** — the §10 checkpoint items only A can do: Vercel env,
   Supabase DDL, demo-query prerendering, rehearsal.

Between loop passes, A's time is free for the milestone-clock work — that is
the entire point of this protocol.

---

## 8. Known tensions in the frozen docs (pre-adjudicated, A may overrule)

| # | Tension | Resolution baked into this plan |
|---|---|---|
| T1 | SPEC §1 says "the browser never imports the Supabase client," but SPEC §5 has the hub subscribing via Supabase Realtime | **Polling wins.** The ticker polls `/api/events` every 5s from day one (SPEC §5 itself calls the fallback "behavior identical to the audience"). Realtime becomes a stretch goal requiring `NEXT_PUBLIC_SUPABASE_ANON_KEY` + RLS on `events` — and SPEC lists "no RLS work" as a non-goal, which settles it |
| T2 | SPEC §2 draws the layout under an `apparatus/` directory | The repo root **is** the apparatus root; paths in SPEC §2 are read relative to repo root |
| T3 | WORKTREE-PLAN §Merge has A pushing direct merges | Superseded by §4 (PR-gated, squash-only); amendment noted in that file |
| T4 | WORKTREE-PLAN gives Lane E `app/begriffs/page.tsx` while SPEC §5 has Begriffs reading `term_snapshots` | Lane E owns the page and renders through an engine-owned route/helper (Lane A charter item 9, stretch); until it exists, E renders the greyed LACUNA panel — never imports `lib/db.ts` directly |
| T5 | SPEC §4 defaults an unset `DEP_*_MODE` to `live`, which makes the keyless fixture gate unsatisfiable and leaves the Gemini key with no mode at all | **Mode resolution:** explicit env value wins; unset + credential present → `live`; unset + credential absent → `fixture`. `DEP_GEMINI_MODE` joins the contract. Production sets every mode explicitly, so deployed behavior is unchanged |
| T6 | SPEC §2 says "`lib/engine/*` is Lane A only," colliding with Lane C's `graph.ts` | `lib/engine/graph.ts` is Lane C's, announced via HANDOFF before touching — everywhere, including the SPEC sentence, reads with that carve-out |
| T7 | SPEC §3's `Claim.confidence` has no column in the §3b `claims` DDL | `confidence` is transport-only — rendered, never persisted. The DDL stands unamended |
| T8 | DESIGN-BRIEF §10 catalogues five provisional instruments (Ontology Builder … Gloss) | The real list is SPEC §0's three (Tracer N°01, Map N°02, Begriffs N°03); the hub renders **3** catalogue cells. §10's styling notes apply by analogy: N°01 graph rules → Map, N°05 reading view → Tracer |
| T9 | DATA-CAVEATS §1 preference order (Brave → Tavily → Google) | Google is closed to new customers; Brave requires a card with ambiguous free-tier QPS. **Tavily primary, Brave fallback** (addendum §1) |

---

## 9. Token-depletion ladder — degrading to manual without drama

The protocol above is deliberately model-agnostic: charters never name a
model, smoke tests are shell commands, and the queue is a markdown file.
Degradation is therefore a staffing change, not a process change.

**Stage 0 — Fable + Ultracode available (start of day).**
Phase 0 scaffold runs as the Appendix A workflow. Lanes run as five parallel
Claude Code sessions. A works the §7 loop.

**Stage 1 — Fable exhausted; Opus/Sonnet remain.**
Same worktrees, same branches, same charters pasted verbatim into new sessions
(`/model` down, or new sessions on the cheaper model). Drop workflow
orchestration — interactive sessions only. Shrink PR size (more, smaller
merges) because cheaper models drift more over long diffs. Lane D's
research/curation work moves to claude.ai or Cowork if Code tokens are the
constraint — it is JSON curation, not app code.

**Stage 2 — no agent tokens; humans finish it.**
Everything that makes this survivable is already mandatory, which is the
reason it is mandatory:

- `main` is linear with one squash commit per feature — the history *is* the
  progress report.
- Charters are priority-ordered task lists with per-item definitions of done —
  a human picks up a lane by reading its charter and its branch's last
  `wip(lane-x): … — next: <step>` commit.
- `scripts/smoke.sh` + the PR template remain the definition of done.
- The debt-marker convention is grep-able:
  `// LACUNA(lane-x): <what is missing> — <how to finish>` and
  `grep -rn "LACUNA(" app components lib scripts` **is the manual-mode
  backlog**, priority-tagged by lane.
- HANDOFF.md is still the queue; it just has human names in it now.

**Manual-mode priority order** (demo value per hour of hand-work):

1. `main` deploys and the hub loads — protect this above all features.
2. Tracer live loop (paste → extract → formalize) — the one guaranteed-live
   demo flow; it needs only the Gemini key.
3. Fixtures + demo choreography — warm `dep_cache` on the 3 demo inputs; chips
   honestly say `COLLATED`.
4. Map on cached mode end-to-end.
5. Ticker, Begriffs panel, copy polish.

**Session-death rule (all stages):** every session commits WIP before context
ends — `wip(lane-x): <state> — next: <step>` — the branch is the handoff,
never a chat transcript.

---

## 10. Milestone clock with orchestration checkpoints

Product milestones are SPEC §6 (frozen). The orchestration overlay — what A
does at each checkpoint:

| Clock | SPEC milestone | A's checkpoint actions |
|---|---|---|
| T−1 (before event) | — | §1 credential queue P0 items, each smoke-tested; **run the SPEC §3b DDL in the Supabase SQL editor** (nothing blocks it — the project exists and SPEC is frozen); Vercel account live with the GitHub app installed (the repo *import* happens at T+0); repo pushed; this doc set on `main` |
| T+0:00–0:20 | Deployed skeleton (SPEC's minimal reading) | Start the Appendix A scaffold workflow on `scaffold/init`; while it runs, import the repo to Vercel and enter every env var + DEP mode (production = live/live/cached/cached/live per SPEC §7) |
| T+1:00 | schemas frozen; dep+fixtures | Scaffold PR through the §3 gate, squash-merged; **production URL verified post-merge**; verify DDL applied (P0-2 smoke); create 5 worktrees; open 5 lane sessions with §5 charters; then merge Lane A's first PR, then Lane E's; confirm every lane rebased; deliver Lane D's keys |
| T+2:00 | Tracer e2e live | Rehearse Tracer once on the deployed URL with a real paste; hit `/api/extract` twice to confirm the content-hash cache (second call ~instant) |
| T+3:00 | Map e2e; hub + ticker | Prerender: run the 3 demo inputs against production until `dep_cache` is warm; flip any flaky dep to `cached` in Vercel |
| T+3:30 | Harvest; chips everywhere | Confirm harvest rows; walk all pages checking ProvenanceChips and LACUNA states; run the demo choreography once end-to-end |
| T+4:00 | Freeze | Rehearsal #1 with wifi, against production; rehearsal #2 with `DEP_*_MODE=cached` across the board — **run it locally via `.env.local`, production env stays at the SPEC §7 demo config** (every prod env flip costs a redeploy, and finals opens with a LIVE paste that all-cached production would silently serve as fixture). If any prod dep *was* flipped during the day, restore SPEC §7 modes, redeploy, and verify a `LIVE` ProvenanceChip on production by 4:30. Copy fixes only from here; lift the DATA-CAVEATS judge-facing summary into the README/slide |
| 4:45 PM | Finals | Demo per SPEC §6 choreography |

---

## Appendix A — Phase 0 Ultracode scaffold workflow

**Phase 0 session charter (the opening prompt for the scaffold session):**

```text
You are Phase 0 (Scaffold) for Apparatus. Read docs/ORCHESTRATION.md §3, then
run the workflow script in Appendix A via the Workflow tool (pass the script
inline), from the repo root on a fresh scaffold/init branch
(git switch -c scaffold/init). If the workflow returns non-green after its 4
verify rounds, fix the listed failures interactively, re-run the §6 checks
yourself, and only then open the scaffold PR — the §3 acceptance gate, not
the workflow verdict, is what merges. Open the PR with the gate evidence and
hand it to A.
```

The script fans out over disjoint path groups in one shared working tree —
which is why **Skeleton agents write files only and never run `git commit` or
`pnpm build`** (concurrent commits collide on `.git/index.lock`, and an agent
running `git add -A` stages a sibling's half-written files; concurrent builds
race on `.next/`). One commit lands after the fan-in; the verify loop builds.

```js
export const meta = {
  name: 'apparatus-scaffold',
  description: 'Phase 0: land the entire Apparatus skeleton, fixture-mode green with zero env vars',
  phases: [
    { title: 'Base', detail: 'create-next-app, deps, tokens, fonts, layout' },
    { title: 'Skeleton', detail: 'parallel fill: engine, routes, UI, fixtures' },
    { title: 'Verify', detail: 'build + smoke + hex grep, fix loop until green' },
  ],
}

const CONTEXT = `Read CLAUDE.md, SPEC.md, docs/DATA-CAVEATS.md, and
docs/ORCHESTRATION.md (§3 lists exactly what the scaffold contains) before
writing. Rules that gate the merge: tokens.css is the only file with color
literals; every LLM route exports maxDuration = 60; lib/db.ts starts with
import "server-only"; schemas.ts follows SPEC §3 verbatim; env modes resolve
per ORCHESTRATION §8 T5; everything must work in fixture mode with NO env
vars set. You share one working tree with other agents: WRITE FILES ONLY —
never run git add/commit, pnpm install, or pnpm build, and never touch files
outside your group's paths. Committing and building happen after fan-in.`

phase('Base')
await agent(`${CONTEXT}
Scaffold the app base IN PLACE at the repo root. create-next-app refuses a
non-empty directory: scaffold into a sibling temp dir, then move the generated
files into the root WITHOUT overwriting the existing docs, tokens.css,
.github/, or .env.example (merge .gitignore contents; ensure .env* stays
ignored). Options: pnpm, TypeScript, Tailwind, App Router, src/ disabled to
match SPEC §2 paths. Then
add deps at the pins from docs/DATA-CAVEATS.md addendum (next@16.x, zod@4.x,
cytoscape@3.34.x, @supabase/supabase-js@^2.112.4 — NOT the 3.0.0-next
dist-tag, @mozilla/readability@0.6.x, jsdom@30.x) plus ai@7, @ai-sdk/google@4,
and server-only. LLM structured output uses generateText + output:
Output.object({schema}) — generateObject is deprecated in ai@7 — and Gemini
rejects z.union in response schemas, so keep every schema flat. Verify node
--version satisfies jsdom's engines field (^22.22.2 || ^24.15.0 || >=26).
Wire tokens.css as the first import
in app/layout.tsx, add the DESIGN-BRIEF §4 Google Fonts link, set body
background var(--stock). Write the vercel.json Ignored Build Step from
ORCHESTRATION §3 item 10 (only main deploys). Create empty directory
structure per SPEC §2. Ensure pnpm build passes, then commit the base to
scaffold/init — you run alone; the parallel Skeleton agents that follow you
do not commit.`, { label: 'base' })

phase('Skeleton')
await parallel([
  () => agent(`${CONTEXT}
Group ENGINE — you own lib/** only. Implement lib/engine/schemas.ts (all SPEC
§3 types as zod + inferred types), lib/env.ts (zod boot validation; keys
optional when the matching DEP_*_MODE is fixture), lib/engine/dep.ts (SPEC §4
ladder, fixture mode fully working, AbortController timeouts per
DATA-CAVEATS), lib/engine/llm.ts (gemini()/hf() callers, content-hash cache,
one repair pass), lib/db.ts (server-only, typed helpers, warn-and-noop
without Supabase vars), lib/engine/graph.ts (StanceCluster[] -> Cytoscape
elements, minimal).`, { label: 'engine', phase: 'Skeleton' }),
  () => agent(`${CONTEXT}
Group ROUTES — you own app/api/** only. Route shells for extract, formalize,
trace, stance, events (+ GET health): zod-validate requests against
lib/engine/schemas.ts, export maxDuration = 60, return fixture-shaped data
through dep()/llm() so every route answers in fixture mode with no keys.`,
    { label: 'routes', phase: 'Skeleton' }),
  () => agent(`${CONTEXT}
Group UI — you own components/** and app pages only (not app/api). Dumb
presentational primitives per DESIGN-BRIEF §6: FolioHeader, Colophon,
ApparatusMargin, Compartment, ProvenanceChip (LIVE / COLLATED HH:MM / FROM
THE RECORD), Ticker (polling), LacunaState; OntologyGraph.tsx shell rendering
fixture elements. Placeholder pages /, /tracer, /map, /begriffs with full
page anatomy (folio header, margin where tools exist, colophon) and LACUNA
states. Lexicon copy verbatim from DESIGN-BRIEF §8.`,
    { label: 'ui', phase: 'Skeleton' }),
  () => agent(`${CONTEXT}
Group DATA — you own fixtures/** and scripts/** only. One schema-valid
placeholder fixture per dependency (search, fetch, gemini, hf, ngram,
wiktionary) under fixtures/<dep>/, a demo paragraph at
fixtures/demo/paragraph.json; scripts/seed-fixtures.ts with a --check flag
that zod-parses every fixture; scripts/harvest-begriffs.ts as a typed stub
with the 5 seed terms and 2s sleeps; scripts/smoke.sh implementing
ORCHESTRATION §6 global checks.`,
    { label: 'data', phase: 'Skeleton' }),
])

phase('Verify')
await agent(`One job: stage and commit ALL uncommitted scaffold work on
scaffold/init as a single commit "scaffold: skeleton fill" (git add -A is
safe now — the parallel writers are done). Do nothing else.`,
  { label: 'fan-in commit' })
const VERDICT = {
  type: 'object', required: ['green', 'failures'],
  properties: { green: { type: 'boolean' },
    failures: { type: 'array', items: { type: 'string' } } },
}
let verdict = null
for (let round = 0; round < 4; round++) {
  verdict = await agent(`Run, in order: pnpm build; bash scripts/smoke.sh with
NO .env.local present; the ORCHESTRATION §6 hex grep (exit-safe if-form); node
scripts/seed-fixtures.ts --check. Also verify every app/api route file
exports maxDuration, lib/db.ts imports "server-only", and vercel.json has the
§3 item 10 ignoreCommand. Return green=true only if ALL pass; otherwise list
each failure with file and error.`,
    { label: `verify-${round + 1}`, phase: 'Verify', schema: VERDICT })
  if (verdict && verdict.green) break
  log(`round ${round + 1}: ${verdict ? verdict.failures.length : '?'} failures`)
  await agent(`${CONTEXT}
Fix exactly these scaffold failures, smallest change that makes the gate
pass, then commit: ${JSON.stringify(verdict ? verdict.failures : ['verify agent died — rerun checks yourself and fix what fails'])}`,
    { label: `fix-${round + 1}`, phase: 'Verify' })
}
return verdict
```

After the workflow returns green: push `scaffold/init`, open the PR, walk the
§3 acceptance gate (including the Vercel deploy), squash-merge, create
worktrees, open lanes.

---

## Appendix B — command crib sheet

```bash
# --- orchestrator (A) -------------------------------------------------------
git switch -c scaffold/init                    # Phase 0 branch
gh pr merge <n> --squash                       # gate first; A is sole merger
git revert <sha>                               # red main: revert, don't fix forward
git worktree add ../apparatus-<lane> -b lane/<lane>   # after the scaffold merge
git worktree list                              # sanity: five lanes + main

# --- every lane -------------------------------------------------------------
pnpm install && cp .env.example .env.local     # once per worktree
git push -u origin lane/<lane>                 # once — sets the upstream
pnpm dev -p 300X                               # your port, §2.2
git diff --name-only origin/main               # ownership check before PR
# open the PR with the gate template (--fill would skip it):
gh pr create --title "[lane-x] <feature>" --body-file .github/pull_request_template.md
PR_HEAD=$(git rev-parse HEAD)                  # record the PR tip (§4.1)
# …keep working with LOCAL commits only — no pushes while the PR is open…
# after YOUR merge (replants only post-PR work; == reset when there is none):
git fetch origin && git rebase --onto origin/main "$PR_HEAD" && git push --force-with-lease
# after ANY OTHER merge:
git fetch origin && git rebase origin/main && git push --force-with-lease

# --- smoke ------------------------------------------------------------------
pnpm build && bash scripts/smoke.sh
node scripts/seed-fixtures.ts --check
grep -rn "LACUNA(" app components lib scripts  # the debt backlog

# --- demo prep --------------------------------------------------------------
# warm the cache on the 3 demo inputs against PRODUCTION, twice each
# flip a flaky dep: Vercel → Settings → Environment Variables → DEP_<X>_MODE=cached → redeploy
```
