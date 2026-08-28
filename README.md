# `<apparatus/>` — DevFestDC 2026 Build-a-thon

**Instruments for reading closely.** One deployed Next.js application: a hub
catalogue and two working instruments — **Tracer** (N°01, claim → logical form →
source status) and **Map** (N°02, contested question → typed disagreement
graph) — plus **Begriffs** (N°03), shipped greyed with its limits stated on the
panel.

This prototype gestures at what LLM semantic capacity unlocks for close reading
at web scale — logical anatomy of claims, stance ontologies, concept history. We
engineered for honesty over illusion: every externally-derived datum is stamped
live / collated / from-the-record, unreachable sources are verdicts rather than
errors, and the diachronic instrument ships greyed with its sampling limits
stated on the panel. The limitation section is not an apology; it is the
apparatus.

## Reading order (agents and humans)

1. [CLAUDE.md](CLAUDE.md) — design + engineering guardrails, per session
2. [SPEC.md](SPEC.md) — architecture, data contracts, milestones (**frozen**)
3. [docs/DATA-CAVEATS.md](docs/DATA-CAVEATS.md) — external dependency registry + fallback ladder
4. [docs/WORKTREE-PLAN.md](docs/WORKTREE-PLAN.md) — your lane, ownership, charter
5. [docs/ORCHESTRATION.md](docs/ORCHESTRATION.md) — credentials, worktree/branch/PR protocol, ask escalation, manual-mode ladder
6. [DESIGN-BRIEF.md](DESIGN-BRIEF.md) + [tokens.css](tokens.css) — the visual system

## Quickstart (per lane)

```bash
# from the main checkout, once (orchestrator):
git worktree add ../apparatus-<lane> lane/<lane>

# in your worktree, every session:
pnpm install
cp .env.example .env.local        # UI lanes need no keys — fixture mode works dry
pnpm dev -p 300X                  # unique port per lane, see ORCHESTRATION §2
```

Work only inside your lane's ownership list. One feature per PR. Smoke-test
before asking for merge. When blocked >10 minutes, write a HANDOFF note and move
to your next charter item.
