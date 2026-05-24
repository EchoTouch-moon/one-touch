# GLM-Words / 一触 CHANGELOG

All notable changes to this project will be documented in this file.

---

## [2026-05-22] 邮箱验证码注册 + 用户配额控制

**Commit**: `8fc2f6a`

### Backend
- 用户通过邮箱验证码自助注册，无需管理员手工发账号
- `GLM_WORDS_REGISTRATION_MAX_USERS` 控制普通用户上限（默认30人）
- 支持 SMTP 发送验证码邮件
- 未配置 SMTP 时验证码输出到后端日志，便于联调

### Frontend
- 注册流程：填邮箱 → 发验证码 → 填密码+验证码 → 提交
- 登录页 Register tab 支持邮箱验证码注册

### Environment Variables
```
GLM_WORDS_REGISTRATION_ENABLED=true
GLM_WORDS_REGISTRATION_MAX_USERS=30
GLM_WORDS_MAIL_PROVIDER=smtp
GLM_WORDS_SMTP_HOST=smtp.qq.com
GLM_WORDS_SMTP_PORT=587
GLM_WORDS_SMTP_USERNAME=your@email.com
GLM_WORDS_SMTP_PASSWORD=授权码
GLM_WORDS_SMTP_FROM=your@email.com
GLM_WORDS_SMTP_TLS=true
```

### Files
- `backend/services/mail_service.py` (new)
- `backend/config.py`, `backend/routers/auth.py`, `backend/services/user_service.py`
- `frontend/src/components/AuthGate.tsx`, `frontend/src/store/authStore.ts`

---

## [2026-05-22] ICP备案 + HTTPS部署

**Commit**: `664aa48`

### Frontend
- Add ICP备案号 (ICP备案号) to login page and main app footer
- Adjust footer layout for better display on mobile

### Infrastructure
- Let's Encrypt SSL certificate for example.com
- HTTPS with HTTP→HTTPS redirect
- HSTS enabled (max-age=63072000)
- Certificate valid until 2026-08-19

### Files
- `frontend/src/App.tsx`, `frontend/src/components/AuthGate.tsx`, `frontend/src/index.css`
- `nginx.conf`, `docker-compose.yml` (on server)

---

## [2026-05-22] Doubao Provider + Enrich Quota System

**Commit**: `待提交`

### Backend
- New `DoubaoProvider` using Ark API `responses.create()` (not `chat.completions.create`)
- Base URL: `https://ark.cn-beijing.volces.com/api/v3`
- New `AiEnrichUsage` model for daily usage tracking per user
- New `enrich_quota_service` for quota management (reserve/release)
- Enrich endpoint checks quota before calling LLM, returns quota in response
- New `/enrich/quota` endpoint for frontend polling
- Admin has unlimited quota, regular users respect `GLM_WORDS_ENRICH_DAILY_LIMIT`

### Frontend
- Settings page reorganized into tabs: Profile / Data / LLM / Admin
- LLM tab shows server config (read-only) + enrich quota (limit/used/remaining)
- WordDetailPage shows remaining quota after enrich
- Proper error message for quota exceeded (includes reset date)
- Removed floating Feedback button

### Environment Variables
```
GLM_WORDS_LLM_PROVIDER=doubao
GLM_WORDS_LLM_MODEL=doubao-seed-2-0-pro-260215
GLM_WORDS_DOUBAO_API_KEY=<ark_api_key>
GLM_WORDS_LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
GLM_WORDS_ENRICH_DAILY_LIMIT=5
```

### Files
- `backend/llm/doubao_provider.py` (new)
- `backend/models/enrich_usage.py` (new)
- `backend/services/enrich_quota_service.py` (new)
- `backend/config.py`, `backend/llm/__init__.py`, `backend/routers/enrich.py`
- `frontend/src/pages/SettingsPage.tsx`, `frontend/src/pages/WordDetailPage.tsx`
- `frontend/src/api/enrich.ts`

---

## [2026-05-22] Sync Replace Mode + Loading UX Polish

**Commit**: `待提交`

### Backend
- Import sync supports `replace` mode (delete all user data before import)
- Multi-tenant isolation fix: replace mode only deletes user's own words
- Skip import if word text already exists globally (prevent duplicates)
- Added unit tests for sync service

### Frontend
- Route loading skeleton screens for Review/Settings/WordList pages
- Review page loading state with animated progress bar
- Offline review cache sync: remove reviewed cards from local cache
- Prevent duplicate review session requests (in-flight guard)

### Files
- `backend/routers/sync.py`, `backend/schemas/sync.py`, `backend/services/sync_service.py`
- `frontend/src/App.tsx`, `frontend/src/pages/ReviewPage.tsx`
- `frontend/src/store/reviewStore.ts`, `frontend/src/utils/offlineReviewQueue.ts`
- `backend/tests/` (new)

---

## [2026-05-21] Review Readiness + Performance Optimization

**Commit**: `5aa2a5c`

### Backend
- Add `definition_count` and `review_ready` fields to WordResponse
- Efficient batch query for review readiness in word list
- Validate word ownership in submit_review endpoint

### Frontend
- Optimize AnimatedCharacters with requestAnimationFrame (fix flicker)
- Add review readiness indicator on WordListPage
- Improve empty state UI with CTA buttons
- Cache review session on start for faster offline access
- 5-minute TTL for cached review sessions

---

## [2026-05-21] Review UX Improvements

**Commit**: `c9a968f`, `b2258b2`, `f499c76`, `affdf2c`

### SettingsPage
- Activity heatmap shrunk from 365 to 84 days (12 weeks)
- Added summary panel: captured/reviewed/active days stats
- Responsive layout: md breakpoint, scrollable container

### App
- Prefetch Review page code and session on browser idle after login
- In-flight guard to prevent duplicate session requests

### WordListPage
- Mobile responsive layout: stacked cards on small screens

---

## [2026-05-20] CanvasPad Modularization

**Commit**: `04bf331`

### Architecture
- Split `CanvasPad.tsx` (1446 lines) into 9 modules:
  - `CanvasPad.tsx`: 191 lines — JSX + toolbar
  - `useCanvasPadController.ts`: state orchestration hook
  - `strokeRenderer.ts`: canvas painting + async WebP preview
  - `inkDocument.ts`: ink data parse/serialize/migrate
  - `inkGeometry.ts`: bounds + eraser intersection
  - `draftStore.ts`: IndexedDB storage + localStorage fallback
  - `gesture.ts`: pinch-zoom math
  - `constants.ts`: named constants
  - `types.ts`: centralized types

### Robustness
- Pure pressure width function (no global mutation)
- Input validation on every point/stroke field
- Bounds-based eraser filtering (90%+ strokes rejected by bbox)
- Async `toBlob` WebP preview with sequence guard
- IndexedDB drafts, localStorage fallback + quota handling
- Error handling for private mode, quota exceeded

**Doc**: `docs/CANVASPAD-v2.md`

---

## [2026-05-20] CanvasPad Performance Optimization

**Commit**: `499c9ea`

### Storage
- IndexedDB draft cache: inkData + preview moved from localStorage
- Fallback to localStorage when IndexedDB unavailable

### Preview
- Async WebP export: `canvas.toBlob('image/webp', 0.82)` with PNG fallback
- Debounced preview generation: immediate ink save, delayed preview
- Sequence guard: prevent stale async preview from overwriting newer state

### Canvas
- paperGuide in ink_data metadata: strokes remember guide type
- Preview renders paper background: consistent grid/lines
- Eraser bbox filtering: coarse bounds check before fine detection
- Removed `willReadFrequently`: avoid slow canvas path
- Pure pressure function: no render-time global mutation

---

## [2026-05-20] Ops Infrastructure for Internal Beta

**Commit**: `401ec30`

### P0 Features
- Auto SQLite backup: startup + 24h interval, 7-day retention
- Docker: backups to `/data/backups`

### P1 Features
- Client error logging: `/api/ops/client-errors` → `client-errors.jsonl`
- Backend file logging: `app.log`, `access.log` to `/data/logs`
- Feedback channel: `FeedbackDialog` → `/api/ops/feedback` → `feedback.jsonl`
- Version display: Settings shows frontend build hash/date, backend version, backup status
- Service Worker update prompt: user-controlled refresh, no silent reload

**Files**: `backend/routers/ops.py`, `backend/services/ops_service.py`, `backend/services/backup_service.py`, `frontend/src/components/ErrorReporter.tsx`, `frontend/src/components/FeedbackDialog.tsx`, `frontend/src/components/UpdatePrompt.tsx`

---

## [2026-05-19] Admin-Managed Accounts

**Commit**: `6c187aa`

### Auth Model
- Switched from invite-code self-registration to admin-managed accounts
- Admin creates users directly via Settings → Users (email + password ≥8 chars)
- `/auth/register` endpoint still exists but `registration_enabled=false`
- AuthGate UI: no register tab, only sign-in

---

## [2026-05-18] WordDetail Simplification

**Commit**: `1a99c0b`

### Layout
- Primary definition first (handwriting preferred)
- Tab strip for switching among definitions
- `max-w-5xl` wide layout
- Split aside on `lg+` screens

---

## [2026-05-17] Fixed Paper + Multi-Page

**Commit**: `7a3f24c`

### Canvas
- Fixed 3:4 portrait paper (600×800 doc-coord units)
- Multi-page: doc.height = N × 800; "+ Page" extends
- Full-screen edit modal
- Double-tap reset (single finger, 350ms / 30px → reset viewport to 100%)

---

## [2026-05-16] Pinch-to-Zoom + Two-Finger Pan

**Commit**: `7c7e603`

### Canvas Gestures
- Pinch-to-zoom on touch devices
- Two-finger pan for scrolling multi-page documents
- Zoom range: 0.5x – 4x

---

## [2026-05-15] Pen Weight Selector

**Commit**: `c09ac9d`

### Toolbar
- Pen weight presets: Fine (0.4), Standard (0.7), Bold (1.0)
- Persisted to localStorage (`glm-words-pen-weight`)
- Visual dot indicators in toolbar

---

## [2026-05-14] Smooth In-Stroke Pressure

**Commit**: `a870426`

### Stylus
- Smooth pressure across points in stroke (5-point window)
- Avoid spindle-shaped strokes from raw pressure jitter
- Gamma curve for pressure response

---

## [2026-05-13] Adaptive Pressure Normalization

**Commit**: `f1db6cc`

### Stylus
- Adaptive normalization for narrow-range stylus
- Historical max tracking with growth limit
- Wider pen thickness range

---

## [2026-05-12] Velocity + Tilt Width Derivation

**Commit**: `13d31c9`

### Stylus
- When pressure = 0: derive pen width from velocity + tilt
- Slow drawing = thicker line
- Tilt angle adds to width

---

## [2026-05-11] Stylus Diagnostics + Ink v2

**Commit**: `2bd25dc`

### Canvas
- Stylus diagnostics panel: pressure, tilt, velocity
- ink_data v2 schema: includes tiltX, tiltY, twist
- Smooth pen feel with adaptive pressure

---

## [2026-05-10] Vector Eraser + Undo/Redo

**Commit**: `a6b6098`

### Canvas
- Stroke-level vector eraser: finds intersecting strokes
- Action-based undo/redo: add/remove operations
- History stack with redo capability

---

## [2026-05-09] Canvas Stale Closure Fix

**Commit**: `4cf9ea8`

### Bug Fix
- Fixed stale closure bug in canvas save
- Handwriting save condition corrected

---

## [2026-05-08] Brand Polish — Logo & Icons

**Commit**: `6c3c179`, `d120d64`

### Brand
- Unified favicon and PWA icons to touch-point logo
- Nav icons refined
- Tagline: 一键收词 · 一笔写义 · 一卡复习
- Login gradient refined

---

## [2026-05-07] Definition Editor Workspace

**Commit**: `211a928`

### Features
- Definition editor workspace
- Rebrand to 一触 ("One Touch")
- Canvas improvements
- Word detail page enhancements

---

## [2026-05-06] Enhanced Canvas Pad

**Commit**: `27c2692`

### Canvas
- Pressure sensitivity support
- UI polish
- Basic drawing functionality

---

## Earlier History

Initial development commits not listed here. Project started as `glm-words` vocabulary learning app with:
- PWA with offline review queue
- SRS review with swipe gestures
- Multi-tenant data isolation
- Admin sees all, users see own
- LLM enrichment for definitions/examples
- SQLite backend with FastAPI
- React + TypeScript + TailwindCSS 4 frontend

---

## Version Naming Convention

This project uses date-based versioning (YYYY-MM-DD) for CHANGELOG entries, aligned with commit timestamps. No semantic version numbers are assigned during internal beta.