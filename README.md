# 一触 (One Touch)

> Write it once, remember it for good. ✍️

**English | [中文文档](README.zh-CN.md)**

一触 is a self-hosted vocabulary app built on one idea: **you write the definition by hand,
and spaced repetition brings that very card back right before you would forget it.**
Capture a word, write its meaning on a full canvas, and review your own ink — SM-2 or FSRS.
It ships as an installable PWA on a small FastAPI + React stack one person can run.

**Status:** private beta. This repository is the sanitized public copy; the production instance is not public.

## Screenshots

All screenshots are the current build in the default *Violet* appearance.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/login.jpg" alt="Sign in" /></td>
    <td width="50%"><img src="docs/screenshots/capture.jpg" alt="Capture a word, then choose handwriting or keyboard" /></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/handwriting-canvas.jpg" alt="Handwriting canvas with pen, eraser and page tools" /></td>
    <td width="50%"><img src="docs/screenshots/review-card.jpg" alt="Reviewing a handwritten card, graded Again / Hard / Good / Easy" /></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/kaoyan.jpg" alt="Kaoyan lexicon browser" /></td>
    <td width="50%"><img src="docs/screenshots/words.jpg" alt="Word library" /></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/word-detail.jpg" alt="Word detail with primary definition, examples and AI assist" /></td>
    <td width="50%"><img src="docs/screenshots/settings.jpg" alt="Settings: profile, data, AI and admin" /></td>
  </tr>
  <tr>
    <td width="33%"><img src="docs/screenshots/mobile-review.jpg" alt="Review on a phone" /></td>
    <td width="33%"><img src="docs/screenshots/mobile-capture.jpg" alt="Handwriting on a phone" /></td>
    <td width="33%"><img src="docs/screenshots/mobile-kaoyan.jpg" alt="Kaoyan lexicon on a phone" /></td>
  </tr>
</table>

## What it does

**Capture.** One field, one word, then a choice: write it by hand or type it. Handwriting is
stored twice — as `ink_data` (vector strokes, ink schema v3) and as a WebP preview
(`canvas_image`) used in lists and thumbnails. Drafts survive a reload via IndexedDB (with a
localStorage fallback), so a half-written card is never lost.

**Write.** The canvas is a fixed 3:4 sheet, extendable page by page, with plain / ruled / grid
guides drawn into the preview. Fine, standard and bold pen weights; a stroke-level vector
eraser; undo/redo; pinch-zoom 0.5×–4× and two-finger pan. Input is filtered (one-euro filter)
and stroke width follows pressure, velocity and tilt, so pressure reads as pressure. Pad mode
defaults to **pen only** so a resting palm cannot draw — switch to "finger on" when you want it.
There is a stylus diagnostics lab at `/handwriting-lab`.

**Review.** Cards come back on an SM-2 or FSRS schedule (configurable, with an Asia/Shanghai
day boundary and a target-retrievability knob). Grade by swiping or with `1`–`4` → Again /
Hard / Good / Easy; `Space` reveals the answer. Handwritten cards are re-rendered exactly as
written. Review works offline: grades enter a local queue and flush when the connection
returns.

**Kaoyan lexicon.** A built-in exam corpus of **4,801 words** in general frequency order with
**3,978 real exam sentences** as evidence — English I 2005–2024 and English II 2010–2025.
Search it, filter All / Not captured / Captured, capture a word in one click, and see your
coverage. Captured words keep their sentence evidence: on a review card, long-press the card
(or tap the dictionary button) to pull the entry and its exam sentences inline, without
leaving the review.

**Library and AI assist.** Search and paginate your words, see which cards are review-ready,
keep several definitions per word (handwritten or typed) with a chosen primary one,
collocations and example sentences. Optional AI enrichment adds a part of speech, a Chinese
meaning and one bilingual example — it never overwrites a definition you wrote yourself, and
keys stay server-side. The daily quota is per user (default 5; admins unlimited).

**Accounts and operations.** Accounts are admin-managed by default; email-code
self-registration can be switched on with an SMTP provider and a seat cap. Words, definitions
and reviews are scoped to their owner. Changing a password invalidates every token issued
before it, and disabling an account locks it out. Auth endpoints are rate-limited per account
and per IP, and outside debug mode the server refuses to boot with default admin credentials
or an `AUTH_SECRET` shorter than 32 characters. Data moves via JSON export/import (merge or
replace), SQLite is backed up automatically (startup + every 24 h, 7-day retention), app and
access logs are written to disk, and Settings shows version, backup status and the AI quota.
Feedback and client-side errors land in server-side JSONL files.

## Design

The interface is one token set rather than per-page decisions — *ink on paper*: warm neutrals,
one interaction hue, one emphasis hue, a closed 13-step type scale, and measured contrast
(body 16.2:1, secondary 8.5:1). Two appearances ship and switch instantly from the header:
**Violet** (default) and **Paper**. Fonts are self-hosted variable faces (Inter, Fraunces,
JetBrains Mono) so nothing depends on a font CDN. The rule set and the reproducible audit
scripts that check contrast, target sizes, overflow, type drift and motion are documented in
[docs/design-system.md](docs/design-system.md).

## Tech stack

| Layer | Choice |
| --- | --- |
| API | FastAPI, SQLAlchemy 2 async ORM, Pydantic v2, SQLite (aiosqlite) |
| Scheduling | Hand-written SM-2 and FSRS-style D/S/R schedulers behind one `BaseSRS` interface |
| LLM | OpenAI, Anthropic, Doubao (Volcengine Ark) and Ollama providers behind one factory |
| Web | React 19, TypeScript, Vite, Zustand, Tailwind CSS 4, Headless UI, Framer Motion |
| Handwriting | `perfect-freehand` outline rendering on layered canvases, WebP preview export |
| App shell | Installable PWA: manifest, service worker with a user-controlled update prompt |
| Deploy | Docker Compose — backend, static frontend image, nginx gateway with TLS |

## Getting started

Requirements: Python 3.12+, [uv](https://docs.astral.sh/uv/), Node 20+.

```bash
# 1. Backend
uv sync
cp .env.example .env          # then set an admin password and a long AUTH_SECRET
uv run uvicorn backend.main:app --reload --port 8000

# 2. Frontend (second terminal)
cd frontend
npm install                   # pnpm install works too
npm run dev                   # http://127.0.0.1:5173 — proxies /api to :8000
```

The admin account from `.env` is created on first start; the Kaoyan corpus in `data/kaoyan/`
is seeded into the database at the same time. SQLite lives at `~/.glm-words/words.db` unless
`GLM_WORDS_DATABASE_URL` says otherwise.

> Outside debug mode the app will not start with the default admin credentials or an
> `AUTH_SECRET` shorter than 32 characters.

### Configuration

Everything is environment-driven; see `.env.example` for a starting point.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GLM_WORDS_ADMIN_USERNAME` / `_PASSWORD` | `admin` / `change-me` | Seed admin account |
| `GLM_WORDS_AUTH_SECRET` | `change-this-secret` | Token signing key (≥ 32 chars outside debug) |
| `GLM_WORDS_DATABASE_URL` | `~/.glm-words/words.db` | SQLite location |
| `GLM_WORDS_ALLOWED_ORIGINS` | `localhost:5173`, `127.0.0.1:5173` | CORS allow-list |
| `GLM_WORDS_REVIEW_ALGORITHM` | `sm2` | `sm2` or `fsrs` |
| `GLM_WORDS_TARGET_RETRIEVABILITY` | `0.9` | FSRS scheduling target |
| `GLM_WORDS_REVIEW_TIMEZONE` / `_DAY_BOUNDARY_HOUR` | `Asia/Shanghai` / `4` | When "today" starts |
| `GLM_WORDS_ENRICH_DAILY_LIMIT` | `5` | AI enrich calls per user per day |
| `GLM_WORDS_LLM_PROVIDER` | `ollama` | `openai` · `anthropic` · `doubao` · `ollama` |
| `GLM_WORDS_LLM_MODEL`, `_BASE_URL`, `_API_KEY`, `_OPENAI_API_KEY`, `_ANTHROPIC_API_KEY`, `_DOUBAO_API_KEY` | — | Provider credentials, server-side only |
| `GLM_WORDS_REGISTRATION_ENABLED` / `_MAX_USERS` | `false` / `30` | Email-code self-registration |
| `GLM_WORDS_SMTP_HOST` / `_PORT` / `_USERNAME` / `_PASSWORD` / `_FROM` / `_TLS` | — | Mail for codes (logs the code when unset) |
| `GLM_WORDS_BACKUP_ENABLED` / `_DIR` / `_RETENTION_DAYS` / `_INTERVAL_HOURS` | `true` / `~/.glm-words/backups` / `7` / `24` | SQLite backups |
| `GLM_WORDS_LOG_DIR` | `~/.glm-words/logs` | `app.log` and `access.log` |
| `GLM_WORDS_DEBUG` | `false` | Skips the production secret check |

The frontend reads `VITE_API_BASE_URL`, `VITE_APP_VERSION`, `VITE_BUILD_DATE` and
`VITE_ICP_RECORD` at build time.

## Docker

```bash
cp .env.example .env          # fill in secrets
docker compose up -d --build
```

Compose runs the API, a static frontend image and an nginx gateway on ports 80/443 (mount your
certificates under `/etc/letsencrypt`). Persistent state — database, backups, logs — lives in
the `glm_words_data` volume at `/data`.

## Project layout

```text
backend/        FastAPI app: routers, services, models, auth, SRS schedulers, LLM providers
  srs/          SM-2 and FSRS implementations behind BaseSRS
  tests/        core flow tests (capture → review → sync → enrich → auth)
frontend/       React PWA: pages, components, stores, design tokens
  src/styles/   token set, base styles, shell and component vocabulary
  scripts/design/  reproducible design/contrast/overflow audit tooling
data/kaoyan/    generated Kaoyan lexicon and exam-sentence corpus
scripts/kaoyan/ corpus build and ingest tooling
docs/           design system, changelog, deployment and handwriting notes
```

## Development

```bash
# Backend: 36 tests
uv run python -m pytest backend/tests/test_core_flows.py

# Frontend: lint, 27 tests across 6 files, production build
cd frontend
npm run lint && npm run test && npm run build

# Optional: design audit of the running UI (contrast, touch targets, overflow, type drift).
# Needs playwright-core and the dev server; see frontend/scripts/design/README.md
node scripts/design/audit.mjs /tmp/audit
```

## Documentation

| Document | What it covers |
| --- | --- |
| [docs/design-system.md](docs/design-system.md) | Token set, appearances, typography and the audit rules |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Dated log of what shipped, newest first |
| [docs/project-progress.md](docs/project-progress.md) | Current state, risks and next steps |
| [docs/handwriting-technical-report.zh-CN.md](docs/handwriting-technical-report.zh-CN.md) | How the stylus pipeline works |
| [docs/handwriting-stylus-experience-plan.zh-CN.md](docs/handwriting-stylus-experience-plan.zh-CN.md) | Handwriting roadmap |
| [docs/CANVASPAD-v2.md](docs/CANVASPAD-v2.md) | CanvasPad module map |
| [docs/beta-deployment-checklist.md](docs/beta-deployment-checklist.md) | Deployment and beta checklist |

## Security notes

- Keep LLM keys server-side; the frontend never receives them.
- Set a strong `GLM_WORDS_AUTH_SECRET` and a non-default admin password in production.
- Terminate TLS at the gateway and keep `GLM_WORDS_ALLOWED_ORIGINS` narrow.
- Never commit `.env`, `*.db`, backups, logs or runtime JSONL.

## License

MIT — see [LICENSE](LICENSE).
