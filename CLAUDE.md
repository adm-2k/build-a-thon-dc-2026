# CLAUDE.md — build-session guardrails

This repository (and any monorepo these files are copied into) is governed by a
single design system: **Apparatus**. Before writing or editing any UI code, read
`DESIGN-BRIEF.md` in full. It is the contract that makes five separately-built apps
read as one product.

## Hard rules (non-negotiable)

1. **Tokens only.** Import `tokens.css` first and take every color, font family,
   type size, radius, and duration from it. Never write a hex value, `rgb()`, font
   name, or radius directly in app styles. No black anywhere — the dark is
   `var(--ink)`.
2. **Both themes, three states.** Never restructure the theming blocks in
   `tokens.css`. Never define a color only inside a media or `[data-theme]` block.
   `body` always sets `background: var(--stock)`.
3. **Page anatomy.** Every view has a folio header and a colophon; tool views have an
   apparatus margin (DESIGN-BRIEF §5).
4. **Rubrication.** Red = instruction, emphasis, live state, or error — nothing else.
   One primary action per view. Blue = interactive only.
5. **Compartments, not cards.** 1px `var(--hairline)` rules; radius 0 (2px inputs);
   no box shadows, no gradients.
6. **Lexicon verbatim** (DESIGN-BRIEF §8): `COLLATING…`, `LACUNA`, `FOLIO MISSING`,
   `Fixed in the record`, `IN REGISTER` / `OFF REGISTER`.
7. **Charts** use `--chart-*` in fixed order, `--seq-*`, `--div-*` exactly as
   specified (DESIGN-BRIEF §9). No generated hues, no dual axes, no color-only status.
8. **Type**: Archivo / IBM Plex Mono / STIX Two Text via the Google Fonts link in
   DESIGN-BRIEF §4. No sizes between 19px and 32px.

## Before you finish any view

Run the ship checklist in DESIGN-BRIEF §12. Grep your styles for `#` — any hex
outside `tokens.css` is a defect. Verify legibility in system-light, system-dark,
forced-light, and forced-dark.

---

# Engineering guardrails (companion to the design rules above)

Authoritative documents, in order: `SPEC.md` (architecture, types, milestones) → `docs/DATA-CAVEATS.md` (external dependencies) → `docs/WORKTREE-PLAN.md` (your lane and ownership) → `docs/ORCHESTRATION.md` (worktree/branch/PR protocol, credentials, ask escalation, manual-mode ladder). Read all four before writing code. When this file and SPEC disagree about the product, SPEC wins; when any document disagrees with ORCHESTRATION about process (branching, merging, asks), ORCHESTRATION wins.

## Hard rules

1. **Types come from `lib/engine/schemas.ts` only.** Never redeclare a shape locally; never widen a type to make a parse pass. If an LLM response fails zod: one repair re-prompt with the error, then the dependency ladder. Never ship `any`.
2. **External calls go through `dep()`** (SPEC §4). No raw `fetch` to search, ngram, Wiktionary, or HF outside `lib/engine/`. Every dep call has an AbortController timeout. Every externally-derived datum rendered in UI carries a `ProvenanceChip`.
3. **Supabase is server-only.** `lib/db.ts` starts with `import "server-only"`. The service-role key never reaches a client component. No new tables without editing SPEC §3b first.
4. **No new dependencies** beyond SPEC §1's list without a HANDOFF note. Especially: no second graph library, no ORM, no state-management library, no CSS beyond Tailwind-on-tokens.
5. **Errors are states, not crashes.** Unreachable source → `weakly_sourced` verdict. Empty data → `LACUNA` component. A hanging spinner is a defect equal to a hex value.
6. **Keep `main` deployable.** Work on your lane branch; merges to `main` go through A. Set `export const maxDuration = 60` on every route that calls an LLM.
7. **Secrets:** only via `lib/env.ts` (zod-validated at boot). Never log a key, never commit `.env*`.
8. **Scope discipline:** if a feature is not in SPEC §0's table, it is a non-goal. Improve the core loop's reliability instead. When genuinely blocked >10 minutes, write a HANDOFF note and switch to your lane's next item rather than improvising around another lane's territory.

## Definition of done, every merge

Lane's ship checklist (WORKTREE-PLAN) + design ship checklist above + `pnpm build` passes locally + the deployed URL still loads after merge.
