# Design verification

Two scripts that make "does this look considered?" measurable. They were written
because review here happens without a pair of eyes available on every change, and
"the design is verified by measurement" is only true if the measurement is
reproducible.

## `audit.mjs` — the live DOM

Measures every route in a real browser at desktop (1440×900) and mobile
(390×844, touch emulated) and reports, per route:

| Signal | Why it matters |
| --- | --- |
| contrast failures, with the offending colour pair | text must clear WCAG AA on its *real* background |
| interactive targets under 44px (touch) / 32px (pointer) | thumb reach |
| horizontal scroll + text overflow | nothing may slide sideways |
| distinct text colours | palette drift |
| distinct type specs | type-scale drift |
| heading order | exactly one `h1`, no skipped levels |
| focus rings on focusable elements | keyboard users can see where they are |
| motion budget (durations + easings) | timing stays on the ladder |
| radius and shadow census | depth stays a decision, not an accident |

Colours are resolved through a canvas, so Tailwind v4's `oklch()` values are
measured rather than silently dropped. It also writes `*.outline.txt` — the
visual tree as text with geometry and type, i.e. a wireframe you can read.

```bash
node scripts/design/audit.mjs /tmp/audit            # every route
node scripts/design/audit.mjs /tmp/audit review     # one route
```

## `pixel-review.py` — what actually reached the screen

Analyses the rendered PNGs for: the real palette and how much of the frame is
ground colour (restraint), ink mass per horizontal band (vertical balance),
column-projection peaks (how many left edges the eye tracks), and blank-row
run-lengths (perceived vertical rhythm).

```bash
python3 scripts/design/pixel-review.py shot.png [more.png ...]
```

## Requirements

- A running app: `pnpm dev` (proxies `/api` to `127.0.0.1:8000`).
- A signed-in preview account. The script logs in against
  `PREVIEW_API/api/auth/login` using `PREVIEW_USER` / `PREVIEW_PASSWORD` from the
  environment (no credentials are stored in the repo). Override the endpoints with
  `PREVIEW_BASE` and `PREVIEW_API` if your fixtures differ.
- `playwright-core` plus a local Chrome (`chromium.launch({ channel: 'chrome' })`),
  or `playwright` with its bundled Chromium if you prefer:
  `pnpm add -D playwright-core` · `python3 -m pip install pillow numpy`.

These are deliberately **not** dependencies of the app — the app ships no test
browser, and a design tool should not be able to break a production install.
