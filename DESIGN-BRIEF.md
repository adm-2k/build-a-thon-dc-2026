# APPARATUS — Design Brief

**System specification for the DevFestDC 2026 build-a-thon suite.**
One hub + five small digital-humanities instruments (ontology builders, XML tools, and
adjacent instruments), deployed together (Vercel/Next.js), built by agent sessions that
must produce visually identical results without seeing each other's work.

**Version 02** — supersedes the palette in `DIRECTION.md`. Authoritative token values
live in `tokens.css`; this document explains how to use them and everything the tokens
cannot encode.

---

## 0. How to use this document (read first, agent)

You are building one part of a suite. Other agents are building the other parts. The
only way the suite reads as one product is if every rule below is followed exactly.

1. Import `tokens.css` before any other stylesheet. **Never** define a color, font
   family, or radius outside it.
2. Follow the page anatomy in §5 for every view — the layout *is* the brand.
3. Copy microcopy from the lexicon in §8 verbatim.
4. Check your work against the banned list (§11) and ship checklist (§12) before
   finishing.
5. When this brief doesn't cover a case, derive from the principle in §1 — never from
   another product's conventions.

---

## 1. Identity

### The concept: *the critical edition*
Digital humanities lays rigorous structure — markup, ontologies, schemas — over
humanistic material. The design system performs the same act visually. Every screen is
composed like a page from a scholarly critical edition: the user's material (the text,
the ontology, the corpus) sits center with the most space and the quietest frame; tool
chrome behaves like the scholar's margin. Minimalism here is discipline, not emptiness:
keep the apparatus out of the text's way.

### The printing metaphor: *two plates, one page*
The whole system is "printed" in two inks on white stock — a duotone, like two-color
process printing:

- **The blue plate** is the *manuscript layer*: all text prints in Prussian blue
  (`--ink`), and the brighter ultramarine (`--blue`) carries structure — links,
  selection, navigation.
- **The red plate** is the *markup layer*: `--rubric` red is used exactly as medieval
  rubricators used red ink — headings' key words, instructions, live/active states,
  errors — never decoration.
- **There is no black anywhere in the system.** The darkest dark is ink blue.
- **Overprint** (`--overprint`) is the violet where the plates overlap — reserved for
  graphics and dataviz depth, never chrome, never text.
- Light mode is the **Proof** (inks on white stock). Dark mode is the **Negative**
  (the film negative: stock and ink swap; plates lighten to hold contrast).

Brand line: **"Markup and manuscript, printed in register."**

### Register
- Aesthetic: Swiss chassis, editorial soul. Structure from the International
  Typographic Style (visible grids, hairlines, metadata labels, giant numerals);
  warmth from print-shop ephemera (a stamp, a ticker, registration marks) used as
  rare, licensed moments.
- Tone: scholarly but warm. Confident, specific, lightly playful in microcopy only.

---

## 2. Naming & wordmark

- **Working name: Apparatus** (from *apparatus criticus*). The hub is the apparatus;
  the five tools are its **Instruments**, numbered `N°01`–`N°05`.
- Tagline: **"Instruments for reading closely."**
- Wordmark: the name set as a self-closing XML element in IBM Plex Mono, medium
  weight, tight tracking — `<apparatus/>` — with the closing slash in `--rubric` and
  the rest in `--ink`. Favicon / avatar mark: `</>` in rubric.
- Each instrument titles itself `NAME — INSTRUMENT (N°0X)` in its folio header.
- Breadcrumbs render as an element path in mono: `apparatus / ontology / class`.

---

## 3. Color

All values in `tokens.css`. Contrast ratios below are against that mode's `--stock`
and were verified; chart palettes additionally passed OKLCH lightness-band, chroma,
CVD-separation (ΔE), and normal-vision-floor checks in both modes.

### Proof (light — default)

| Token | Value | Contrast | Use |
|---|---|---|---|
| `--stock` | `#FFFFFF` | — | Page and cell ground (stark white stock) |
| `--stock-2` | `#F3F5F9` | — | Panels, raised cells (a 5% screen of ink) |
| `--hairline` | `#D9DDE7` | — | Every rule and border, always 1px |
| `--ink` | `#14204A` | 15.7:1 | All text. There is no black |
| `--ink-2` | `#565F7C` | 6.3:1 | Secondary text |
| `--rubric` | `#D6220C` | 5.1:1 | Red plate: instruction, emphasis, live, error |
| `--blue` | `#2438CC` | 8.3:1 | Blue plate: links, selection, structure |
| `--overprint` | `#3B1355` | — | Graphics/dataviz depth only. Never text/chrome |

### Negative (dark)

| Token | Value | Contrast | Note |
|---|---|---|---|
| `--stock` | `#0C1023` | — | The ink becomes the ground |
| `--stock-2` | `#151B34` | — | |
| `--hairline` | `#2B3254` | — | |
| `--ink` | `#EDEFF6` | 16.4:1 | The stock becomes the ink |
| `--ink-2` | `#9AA1BD` | 7.4:1 | |
| `--rubric` | `#FF5C40` | 6.2:1 | Plates lighten; roles unchanged |
| `--blue` | `#7C8CFF` | 6.3:1 | |
| `--overprint` | `#A98BE0` | — | |

### Usage rules

1. **Rubrication rule.** Red answers one question: *"is this an instruction, an
   emphasis chosen by the author, or something happening right now?"* If no, it is
   not red. At most one rubricated phrase per heading; never whole sentences.
2. **Blue is interactive.** If it's blue, a user should be able to click, select, or
   follow it (links, active nav, selection, focus rings share this family). Links are
   `--blue` and underlined.
3. **Text is ink.** Values, labels, and chart legends always wear `--ink`/`--ink-2` —
   never a plate or chart color.
4. **Washes** (`--wash-blue`, `--wash-red`) are 8–16% tints for row highlights, text
   selection surrogates, and annotation ranges. Never set text in a wash.
5. **Status** (`--ok/--warn/--err/--info`) is a documented functional exception to the
   duotone, reserved for state only, and **always paired with an icon or label** —
   never color alone. `--err` *is* the rubric: errors are rubricated, like a
   proofreader's corrections.

### Theming contract (all three viewer states)

`tokens.css` already implements this; do not restructure it:

- Bare `:root` = complete Proof palette (default).
- `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`
  = Negative.
- `:root[data-theme="dark"]` = Negative again (explicit choice wins both directions).
- Components reference tokens only; no color may have its only definition inside a
  media or `[data-theme]` block. `body` always sets `background: var(--stock)`.

---

## 4. Typography

Three voices, three roles. Free, from Google Fonts:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=STIX+Two+Text:ital,wght@0,400;0,500;1,400&display=swap">
```

| Voice | Face | Role |
|---|---|---|
| **The Architect** | Archivo | UI, headlines, structure. Headings weight 600, letter-spacing −0.02em to −0.025em, `text-wrap: balance` |
| **The Cataloguer** | IBM Plex Mono | Micro-labels (11px, uppercase, letter-spacing 0.09em, weight 500), metadata, XML/code, and display numerals at poster sizes (weight 600, `font-variant-numeric: tabular-nums`) |
| **The Manuscript** | STIX Two Text | Long-form reading and source texts, 17px/1.65. Broad Unicode coverage (Greek, critical signs, diacritics) so corpora never fall back mid-sentence |

Rules:

- **No middle sizes.** Reading scale (11–19px) or poster scale (32/56/96/160). Nothing
  between 19 and 32.
- Body text measure ≤ 65ch. Micro-labels are the only uppercase text.
- Hierarchy by size and tone (ink → ink-2 → one rubricated phrase), not by stacking
  weights.
- Numerals that align in columns always get `tabular-nums`.

### XML / code coloring (the one syntax theme, all instruments)

| Part | Token |
|---|---|
| Element names & angle brackets | `--rubric` (markup is the red plate) |
| Attribute names | `--ink-2` |
| Attribute values | `--blue` |
| Text content | `--ink` |
| Invalid/erroneous node | `--err` wavy underline + message |

Code blocks: `--stock-2` ground, 1px `--hairline` border, mono 13px/1.7,
`overflow-x: auto`.

---

## 5. Page anatomy (every view, every instrument)

```
┌──────────────────────────────────────────────────────────┐
│ FOLIO HEADER    tool name/wordmark · mono label · N°/state│ ← 1px hairline below
├───────────────────────────────────────────┬──────────────┤
│                                           │  APPARATUS   │
│              TEXT BLOCK                   │  MARGIN      │
│   the user's material: widest, quietest   │  controls,   │
│                                           │  annotations,│
│                                           │  validation  │
├───────────────────────────────────────────┴──────────────┤
│ COLOPHON  set-in note · event stamp · reg mark · links   │
└──────────────────────────────────────────────────────────┘
```

- **Folio header:** left — wordmark or instrument name; right — mono micro-labels:
  `INSTRUMENT (N°02)`, document state (`status="draft"`), date. 1px hairline below.
- **Text block:** the working canvas. Most space, least chrome.
- **Apparatus margin:** right column (~280–320px, stacks below on mobile), mono voice,
  dense; separated by a 1px hairline, never a shadow.
- **Colophon (footer):** every page. "Set in Archivo, IBM Plex Mono & STIX Two Text ·
  Printed in two inks on `--stock` · Built at DevFestDC 2026, Washington, D.C." plus
  the event stamp (§7) at small size.
- Grid: 12 columns, 24px gutters, max-width 1440px, spacing scale
  4/8/12/16/24/32/48/64/96.
- **Compartments, not cards:** regions are divided by 1px `--hairline` rules and cell
  borders. Radius 0 (2px on inputs/pills only). **No shadows** — overlays get a 1px
  `--ink` border and a scrim of ink at 40% opacity.

---

## 6. Components

Specs are normative; markup is indicative.

**Micro-label** — `font: 500 11px var(--font-mono); letter-spacing:.09em;
text-transform:uppercase;` in `--ink`, `--ink-2` (dim), or `--rubric` (live).
Numbered form: `( N°01 )`.

**Compartment cell grid** — bordered cells sharing 1px hairlines (collapse doubles);
cell padding 24–40px; hover state: background `--stock-2`, 140ms.

**Catalogue cell** (hub entries, lists-of-things):
```
( N°02 )                              (→)
XML Workbench
3 DOCUMENTS VALID
```
N° in rubric mono; name in Architect 600; live count as dim micro-label; arrow-circle
top right (26px circle, 1px `--ink` border → `--blue` on hover).

**Buttons** — Primary (one per view, it is an *instruction*, hence rubricated):
`--rubric` fill, `--on-rubric` text, radius 2px, mono uppercase 12px. Secondary: 1px
`--ink` border, transparent fill, ink text. Tertiary: text link in `--blue`,
underlined. Disabled: `--ink-2` at 50%, no fill.

**Inputs** — 1px `--hairline` border, `--stock` fill, radius 2px, ink text; label as
micro-label above; focus = 2px `--rubric` outline, offset 2px; error = `--err` border
+ message with icon.

**Ticker** — full-width strip, `--rubric` ground, `--on-rubric` mono uppercase 11px,
38s linear loop, paused under `prefers-reduced-motion`. Hub only, max one per page.

**Index dots** — pagination/wayfinding: filled ● current in ink, hollow ○ rest in
`--hairline`.

**Tables** — full-width, hairline row rules only (no zebra, no vertical rules except
in compartment grids); header row as micro-labels in `--ink-2`; numeric columns
right-aligned with `tabular-nums`.

**Status line / footnote bar** — bottom strip in mono 11.5px uppercase `--ink-2`,
hairline above: where "COLLATING…", "Fixed in the record", and validation summaries
live.

**Event stamp** — circular SVG roundel, `DEVFESTDC 2026 · WASHINGTON D.C. ·` on a
text-path, `</>` centered, stroke and type in `--rubric`, 1–1.5px strokes. Colophon
and splash only. Optional 60s linear rotation, killed by reduced-motion.

**Registration mark** — small crosshair-in-circle (⌖-style, 12–14px, 1px stroke,
`--ink-2`), placed in folio headers and at plate corners in marketing/hub surfaces.
Decorative furniture; `aria-hidden="true"`.

**Misregistration display treatment** — on ONE display-scale phrase per page at most
(usually the hero): the rubricated phrase carries
`text-shadow: 0.045em 0.045em 0 var(--misreg)` — a slight off-register second plate.
Never on body or UI text.

**Halftone screen** — decorative dot texture:
`background-image: radial-gradient(circle, currentColor 1px, transparent 1.2px);
background-size: 7px 7px;` in `--ink-2` at low opacity. One moment per page maximum.

---

## 7. Motion

- 120–180ms, `cubic-bezier(0.2, 0, 0, 1)`, opacity + ≤8px translate. No springs, no
  bounce, no parallax. *A page turn, not a rubber band.*
- Continuous motion allowance: the ticker and the stamp rotation only.
- Honor `prefers-reduced-motion` globally (already in `tokens.css`).

---

## 8. Voice & lexicon

Copy rules: sentence case everywhere except micro-labels; active voice; a control says
exactly what happens; errors say what went wrong and how to fix it. The scholarly
vocabulary below is shared by all instruments — copy verbatim:

| System says | Instead of | Where |
|---|---|---|
| `COLLATING…` | Loading… | Any wait state |
| `LACUNA — nothing recorded here yet.` | No results / empty | Empty states |
| `FOLIO MISSING` | 404 | Not-found page |
| `Fixed in the record` | Saved! | Save confirmations |
| `CONCORDANCE` | Search | Search affordances |
| `COLOPHON` | Footer / About | Page end |
| `IN REGISTER` | Valid / all checks pass | Validation success |
| `OFF REGISTER` | Invalid / errors found | Validation failure summary |

---

## 9. Data visualization

Palettes are pre-validated (CVD ΔE, lightness band, chroma floor, normal-vision floor,
contrast vs surface — both modes). Use exactly as specified:

- **Categorical** — `--chart-1` … `--chart-5` in FIXED order (blue plate, red plate,
  blue tint, red tint, overprint violet). Never cycle, never generate a 6th hue: fold
  extras into "Other" or facet. A filter that removes series must not repaint the
  survivors — color follows the entity.
- **Sequential** (magnitude) — `--seq-1` … `--seq-5`, screens of the blue plate,
  light→dark.
- **Diverging** (polarity) — `--div-neg` (red) ↔ `--div-mid` (neutral) ↔ `--div-pos`
  (blue). The two plates are the two poles: the palette is the brand.
- **Never**: dual y-axes; rainbow ramps; text in series colors; a legend omitted when
  ≥2 series; status colors reused as series colors.
- Marks: 2px lines, ≥8px markers, thin bars with 2px stock gaps between segments;
  grid/axes recessive in `--hairline`/`--ink-2`; tooltips on hover by default;
  provide a table view for every chart.
- Ontology graphs count as dataviz: node fills from the categorical order by class
  family, node shape = square compartment (radius 0, 1px hairline stroke), edges in
  `--ink-2`, selected node ringed in `--rubric`, hover wash `--wash-blue`.

---

## 10. The hub, and per-instrument guidance

### The hub — *the catalogue*
A table of contents in compartment cells. Anatomy top to bottom: ticker (build-a-thon
announcements) → folio header with `<apparatus/>` wordmark → a display-scale thesis
line (one rubricated phrase, optional misregistration treatment) → the catalogue grid:
five catalogue cells, one per instrument, each with N°, name, one-line function, and a
**live count** pulled from the instrument (`14 CLASSES DEFINED`) → colophon with stamp.
Identity comes from the registry number, never from per-app colors.

### Instruments (tool list pending confirmation — apply the pattern to the real five)

| N° | Working name | System notes |
|---|---|---|
| N°01 | Ontology Builder | Graph canvas per §9. Class list in the apparatus margin; property tables per §6. |
| N°02 | XML Workbench | Editor uses the §4 syntax theme (elements are rubricated). Validation panel in the margin; `IN REGISTER` / `OFF REGISTER` as the status verdict. |
| N°03 | Concordance | KWIC results as a hairline table; the hit term rubricated; counts as micro-labels; big result-count numeral in Cataloguer at poster scale. |
| N°04 | Metadata Mapper | Two-column crosswalk: source column labeled as the blue plate, target as the red plate — a literal two-plate mapping; connector lines 1px, hover in `--wash-blue`. |
| N°05 | Gloss (annotation) | Reading view in Manuscript serif; annotation ranges as `--wash-blue` with a solid `--blue` underline; notes in the apparatus margin, mono, numbered `( N°n )`. |

Every instrument keeps: folio header, apparatus margin, colophon, lexicon, tokens.

---

## 11. Banned

- Black (`#000`, near-blacks) anywhere — the dark is always ink blue.
- Any color, font, or radius not in `tokens.css`.
- Box shadows (overlays use borders + scrim), gradients as decoration, glassmorphism.
- Border radius > 2px; pill-shaped buttons; circles except arrow buttons and stamp.
- Rubric red as decoration (backgrounds, icons at rest, dividers).
- Emoji in UI copy or as icons. Icons are 1px-stroke line icons or typographic marks.
- Middle type sizes (20–31px). Centered body text. Uppercase outside micro-labels.
- Skeleton shimmer (use `COLLATING…` status line), spinners with brand swooshes.
- Dual-axis charts, generated hues, color-only status.

## 12. Ship checklist (run before finishing any view)

1. `tokens.css` imported; zero hardcoded colors/fonts/radii (grep for `#` in styles).
2. Legible in all three theme states: bare (system light AND system dark), forced
   light, forced dark. Body background is `var(--stock)`.
3. Folio header, apparatus margin (where tools exist), and colophon present.
4. Exactly one primary (rubricated) action; links blue and underlined; focus visible.
5. Microcopy matches §8 verbatim; micro-labels are the only uppercase.
6. Charts use the fixed palettes; legends present; table view exists.
7. `prefers-reduced-motion` honored; ticker/stamp are the only looping motion.
8. Keyboard: all interactive elements reachable, visible 2px rubric focus ring.

## 13. File manifest

| File | Purpose |
|---|---|
| `DESIGN-BRIEF.md` | This document — the one-shot handoff spec |
| `tokens.css` | Authoritative tokens, three-state theming, base rules |
| `CLAUDE.md` | Session guardrails for agents building the apps |
| `DIRECTION.md` | Historical: the original proposal (palette superseded) |

Copy all three live files into the build-a-thon monorepo root; each app imports
`tokens.css` globally (e.g., in Next.js `app/layout.tsx` via a global stylesheet).
