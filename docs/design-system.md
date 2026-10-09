# 一触 — Design system

The frontend is built from one token set and one component vocabulary. Pages
compose those; they do not invent their own colours, timings, radii or depths.

Source of truth:

| File | Owns |
| --- | --- |
| `frontend/src/styles/fonts.css` | the three typefaces (self-hosted, Latin subsets) |
| `frontend/src/styles/theme.css` | `@theme` tokens: type scale, palette, radius, depth, motion |
| `frontend/src/styles/base.css` | element defaults, focus ring, selection, grain |
| `frontend/src/styles/shell.css` | app chrome, viewport budgets, tab bar |
| `frontend/src/styles/components.css` | the reusable component classes below |

---

## 1. Concept — ink on warm paper

The product is handwriting on paper, so the interface is paper. The ground is a
warm off-white stock, text is a warm near-black called *ink*, and exactly two
hues carry meaning: **indigo ink** (`brand`) for interaction, and **terracotta**
(`accent`) for emphasis. Everything else is a neutral.

No pure greys, no pure white, no pure black. Neutrals are warm
(`--color-ink: #17150f`, `--color-paper: #f4f1ea`).

## 2. Typography — three voices

| Voice | Token | Job |
| --- | --- | --- |
| Inter | `font-sans` | interface and body copy |
| Fraunces | `font-display` | the word itself, page titles, statistics |
| JetBrains Mono | `font-mono` | phonetics, figures (`.num`), `.eyebrow`, `.kbd` |

Fraunces is a variable serif with an optical-size axis, so it is set with
`font-optical-sizing: auto`. It is the reason a flashcard feels like letterpress
rather than like a `<div>`.

The scale is **closed**: `theme.css` sets `--text-*: initial`, which deletes
Tailwind's default ladder, then declares exactly thirteen steps — 10, 11, 12, 13,
15, 17, 20, 22, 24, 28, 40, 48, 56px (plus `--text-eyebrow`, which is the 11px
step with tracking and caps attached). If a size is not in that list it does not
exist, so drift has nowhere to enter. Arbitrary `text-[…rem]` values are a bug.

Rules:

- Use only those thirteen steps.
- Display type is tight (`-0.02em` to `-0.034em`); body copy is neutral.
- The word on a flashcard is `--text-word` (48px); page titles are
  `--text-display-sm` (28px); the definition you read on the back is `--text-xl`.
- Any figure that sits in a column uses `.num` so digits align.
- `.eyebrow` is the only uppercase, letter-spaced style.

## 2b. Appearances

Two themes ship, selectable from the half-disc button in the header or the row in
the account menu, persisted in `localStorage` and applied to
`<html data-theme>` before first paint by an inline script in `index.html`.

| | Violet (**default**) | Paper |
| --- | --- | --- |
| Ground | `#f7f7fa` | `#f4f1ea` |
| Brand | `#4f46e5` | `#4b44d6` |
| Accent | `#7c3aed` | `#a8462c` |
| Grain | none | 2.6% fractal noise |
| Shadows | cool slate | warm umber |

Implementation: every colour-shaped token in `@theme inline` resolves through a
plain `--t-*` custom property, so the utilities compile to `var(--t-ink)` and one
attribute reskins the whole app — no duplicated utility classes, no per-component
branching. Shadows are themed too, via `var(--t-shadow-*)` inside the shadow
values.

Two things deliberately do **not** follow the theme:

- The **handwriting canvas**. It draws white paper, blue rules and a grey desk
  because the exported image must match exactly what was written, and real ruled
  paper is blue. Only the element's own backdrop uses `--color-surface`.
- The **mascot illustration**, whose indigo/ink/terracotta/ochre are illustration
  colours rather than interface colours.

## 3. Colour

Contrast was chosen, not inherited: every text token below clears WCAG AA
against `--color-paper` **and** against `--color-surface`, measured.

| Token | Role | Contrast on paper |
| --- | --- | --- |
| `ink` | headings, primary text | 16.2:1 |
| `ink-soft` | secondary text | 8.5:1 |
| `ink-mute` | tertiary text, labels, captions | 5.2:1 |
| `ink-faint` | **decorative only** — icons, rules, never text | 2.3:1 |
| `brand` / `brand-deep` | links, active state, focus | 6.0 / 7.9:1 |
| `accent` | rarity: exam badges, streaks | 5.2:1 (5.1:1 on `accent-wash`) |
| `good` / `warn` / `bad` | review grades, alerts | 4.7 / 4.5 / 5.4:1 |

Each semantic token is paired with a `-wash` background, and every pairing was
measured too: `good` on `good-wash` 5.8:1, `warn` on `warn-wash` 5.7:1, `bad` on
`bad-wash` 6.0:1, `brand-deep` on `brand-wash` 7.6:1. The `.pill-*` classes are
therefore AA at 12px, not just for large text.

`ink-faint` is the one trap: it is for hairlines and glyphs, never for a word a
user has to read.

## 3b. The viewport budget, and why heights are explicit

`--shell-top`, `--shell-bottom` and `--footer-h` describe everything the chrome
takes, and a full-height route is exactly
`calc(100dvh - shell-top - shell-bottom - footer-h)`.

**This must be a definite height, not a flex-derived one.** The flashcard is built
from four nested `h-full` levels; a percentage only resolves against a containing
block with a definite height, and a flex item whose own `height` is `auto` does
not qualify. Replacing the explicit `calc()` with `flex: 1` looked equivalent and
silently collapsed the card to 0px — the DOM reported a happy layout while the
card was gone. Two related traps:

- A full-height route is a flex item, so `margin-inline: auto` makes it
  **shrink to fit** instead of filling the row. `width: 100%` is load-bearing.
- The header's bottom hairline sits outside its content height, so `--shell-top`
  carries a `+1px`. Without it every full-height route scrolled by exactly 1px —
  and any scroll at all lets the sticky header clip the first row.

`.app-footer` has a fixed height and clips, so a wrapped ICP line can never change
the budget.

## 4. Space, radius, depth

- Spacing is Tailwind's 4px scale. Page frame is `.page`
  (`--container-page`, responsive inline padding); prose is capped near 52ch.
- Radii come from `--radius-xs … --radius-3xl`. Buttons and fields share
  `--radius-md`; cards use `--radius-lg`; the flashcard uses `1.35rem`.
- Depth is warm and always layered (`--shadow-hair` → `--shadow-float`).
  A surface at rest has `--shadow-hair`; hover promotes it one step.
  Never apply two competing shadows to one element.

## 5. Motion

Durations live in one ladder: `--dur-tap` 120ms, `--dur-quick` 180ms,
`--dur-base` 260ms, `--dur-slow` 420ms, `--dur-page` 520ms.

Tailwind's numeric `duration-*` utilities are not on that ladder, so components
write `duration-[var(--dur-quick)]` rather than `duration-150` — the ladder is the
single source of truth, not a suggestion.

- Every interactive element responds within 120ms of press.
- Easings: `--ease-out-expo` for entrances and lifts, `--ease-spring` for
  playful scale, `--ease-in-out-soft` for loops.
- One idea per transition. Nothing bounces twice.
- `prefers-reduced-motion` collapses all of it (handled in `base.css`, plus
  `MotionConfig reducedMotion="user"`).

## 6. Component vocabulary

Everything below lives in `components.css`.

**Surfaces** `.card` `.card-raised` `.card-float` `.card-quiet` `.card-interactive` `.well` `.rule`

**Actions** `.btn` + `.btn-primary` (ink — the decisive action), `.btn-secondary`,
`.btn-brand`, `.btn-ghost`, `.btn-danger`; sizes `.btn-sm` `.btn-lg` `.btn-block` `.btn-icon`

**Input** `.field` `.field-hero` (the capture input) `.field-bare` `.label`

**Status** `.pill` + `.pill-neutral` `.pill-line` `.pill-brand` `.pill-accent` `.pill-good` `.pill-warn` `.pill-bad`

**Text** `.eyebrow` `.ipa` `.num` `.link` `.kbd` `.word`

**Data** `.stat-value` `.stat-label` `.track` `.track-fill`

**States** `.empty` `.skeleton` `.navlink` `.tabbar-item`

**Frame** `.page` `.page-head` `.page-title` `.page-lede` `.app-canvas`

### Non-negotiables

1. Minimum interactive target: 44×44 on touch, 32×32 on pointer.
2. Every route has exactly one `<h1>`; heading levels never skip.
3. Every focusable element shows the shared `:focus-visible` ring.
4. No horizontal scrolling at 390px.
5. Text never uses `ink-faint`. Every other text token clears 4.5:1 on both
   `paper` and `surface`, including on its own `-wash`.
6. Buttons in their disabled state stay legible (opacity ≥ 0.42).

---

## 7. Verifying a change

The design is checked by measurement, not by eye. `frontend/scripts/design/`
holds the harness (see its README for requirements):

```bash
cd frontend
node scripts/design/audit.mjs /tmp/audit          # every route, both viewports
node scripts/design/audit.mjs /tmp/audit review   # one route
```

`audit.mjs` reports, per route and per viewport: contrast failures with the
offending colour pair, targets under 44px (touch) / 32px (pointer), horizontal
overflow, distinct text colours (palette drift), distinct type specs (scale
drift), heading order, focus rings, motion budget, and a radius/shadow census —
plus a `*.outline.txt` rendering of the visual tree with geometry and type, i.e.
a wireframe you can read as text.

`pixel-review.py` analyses the rendered PNGs for ground-colour share (restraint),
ink mass per band (vertical balance), column-projection peaks (how many left
edges the eye tracks) and blank-row run-lengths (perceived rhythm).

**Current state:** every route, at both viewports — 0 contrast failures,
0 undersized targets, 0 horizontal scroll, exactly one `h1`.

### Measurement is necessary, not sufficient

The audit found real defects (8 contrast failures on the login screen, a 422 in
the capture recovery path, a React hook-order crash). It is structurally blind to
others, all of which were only caught by looking at the rendered pages:

| Only visible by eye | Example that had to be fixed |
| --- | --- |
| Perceived weight of a state | A disabled primary at 42% opacity was a grey slab and the heaviest object on the hero |
| Balanced vs. dead space | Word rows had ~700px of empty middle; the heatmap floated in a wide empty card |
| Column alignment | The review header was 448px while the card and controls were 320px |
| Line breaks | A 56px headline orphaned "good." onto a third line in a 556px column |
| Redundant content | A definition card printed the part of speech twice, adjacent |
| Copy that fits the device | "Enter to capture" and "press 1–4" shown on a touch screen |
| Illustration scale | A mascot grew until it crowded the copy above it |

So: run the audit, **then look at the screenshots**. `scripts/design/` covers the
first; `shoot.mjs`-style captures plus a pair of eyes cover the second.

**Capture-harness gotcha:** `width`/`height`/`deviceScaleFactor` are not
top-level `newContext` options — the size must be nested under `viewport`.
Passing them flat silently renders every "mobile" shot at 1280×720.
