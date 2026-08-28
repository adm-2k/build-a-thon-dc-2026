# [lane-_] <feature>

**One feature per PR.** Title format: `[lane-x] <feature>`. Body states what the
feature does in two sentences and pastes the smoke evidence.

## Smoke evidence

<!-- paste the command(s) run and their tail output — see docs/ORCHESTRATION.md §6 -->

## Gate (all boxes or no merge — docs/ORCHESTRATION.md §4)

- [ ] `pnpm build` passes locally
- [ ] Lane smoke test passes (`scripts/smoke.sh` + lane checks, §6) — evidence pasted above
- [ ] Hex grep clean: no color/font/radius literals outside `tokens.css`
- [ ] Ownership clean: `git diff --name-only origin/main` touches only my lane's files (or a HANDOFF note authorizes the exception)
- [ ] Rebased on `origin/main` HEAD at PR time
- [ ] Every new LLM-touching route exports `maxDuration = 60`
- [ ] Every new externally-derived datum renders a `ProvenanceChip`
- [ ] No secrets in the diff; env access only via `lib/env.ts`
- [ ] If a data contract changed: SPEC §3 was amended first, and a HANDOFF note flags it

## Debt left behind

<!-- list any `LACUNA(lane-x):` markers this PR introduces, or "none" -->
