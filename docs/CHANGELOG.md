# GLM-Words / 一触 CHANGELOG

All notable changes to this project will be documented in this file.

---

## [2026-10-09] 设计系统重建 — 以获奖级品质重做全部界面

**Status**: uncommitted working tree

界面从「Tailwind 默认色 + 每页各自发挥」重建为一套有主张、可验证的设计系统。
方向是 **ink on warm paper（暖纸上的墨）**：纸色地面、暖近黑正文，只有两个色相
承担含义 —— indigo ink（交互）与 terracotta（强调）。

详见 [`docs/design-system.md`](design-system.md)。

### 设计系统（新增）
- `src/styles/fonts.css` — 自托管三款可变字体（Inter / Fraunces / JetBrains Mono），
  仅打包 Latin 子集，CJK 交给系统字体。不依赖 Google Fonts CDN（中国大陆不可达）。
  来源与 OFL 授权见 `src/assets/fonts/README.txt`。
- `src/styles/theme.css` — 全部令牌：字阶、色板、圆角、阴影、动效、布局预算。
  `--text-*: initial` 删除 Tailwind 默认字阶，只留 13 级；漂移无处进入。
- `src/styles/base.css` — 元素默认值、统一 focus ring、选区、纸纹、reduced-motion。
- `src/styles/shell.css` — 应用外壳、视口预算、底部标签栏。
- `src/styles/components.css` — 组件词汇：`.btn*` `.field*` `.card*` `.pill*`
  `.word` `.ipa` `.num` `.eyebrow` `.kbd` `.empty` `.skeleton` `.track` 等。
- 色板按对比度反推而非凭感觉：正文 16.2:1、次级 8.5:1、三级 5.2:1，
  语义色及其 wash 配对全部实测 ≥4.5:1。`ink-faint` 仅用于装饰。

### 界面
- 登录页重做：暖纸双栏排版、Fraunces 主张标题、分段控件、真实密码可见性切换、
  移动端品牌头；保留并重新配色了原有的角色插画（跟随光标）。
- 应用外壳：`@headlessui` 账号菜单（键盘可达）、跳转到内容、滚动复位、
  路由过渡、复习到期数角标、定制 Toast。
- Capture：标题式 hero 输入改为「纸上的横线」而非方框。
- Review：卡面用 Fraunces 排词、进度用 `.track`、评分按钮带色点与快捷键。
- Words / WordDetail / Kaoyan / Settings：统一信息层级、空状态、骨架屏与分页。
- CanvasPad 工具条、全屏书写面板、反馈/未保存/更新提示、诊断面板全部并入令牌体系。

### 修复
- **捕获已存在的单词会静默失败**：恢复路径请求 `page_size=200`，而接口上限为 100，
  返回 422 导致既不跳转也无有效提示。现在 `api/words.ts` 统一钳制并导出
  `MAX_PAGE_SIZE`，命中重复时直接打开已有卡片；新增 `src/api/words.test.ts` 回归测试。
- 登录页 `useMemo` 位于提前 return 之后，破坏 Hook 顺序并触发 React 错误边界。
- `AuthGate` 标题层级为 h2→h1；改为 DOM 顺序 h1 在前，视觉位置由 CSS `order` 决定。
- 复习会话缺少 `h1`；Settings 标签页补全 `aria-controls` / `role="tabpanel"`。
- `IcpRecordLink` / manifest / favicon / `theme-color` 仍是旧品牌色 `#4f46e5`，
  已统一到 `--color-brand #4b44d6` 与 `--color-paper`；PWA 图标重新生成。
- 删除死代码 `components/ReviewProgress.tsx`。

### 视觉复核（第二轮）
量测通过后做了真实的视觉逐页复核（逐张看渲染结果），修掉一批**只有眼睛能发现**的问题：
- 禁用态主按钮在 42% 不透明度下变成一块死灰色板 —— 是全屏最重的元素却完全失效。
  改为安静的描边态，焦点回到输入行。
- 复习流程三处宽度不一致（表头 448px vs 卡片/按钮 320px），统一到同一栏宽。
- 单词列表每行中间约 700px 死区；改为「左标签 / 右元数据」双边结构。
- 设置页热力图右侧约 800px 空白；改为热力图与统计并排一行。
- 话题分栏控件横跨整页却只占左侧 1/3；改为宽度自适应内容。
- 词详情卡片把词性显示了两遍（方块 + 药丸）；方块改为表示「录入方式」。
- 登录页大标题在 556px 栏内把 "good." 挤成第三行；降一档字号换回两行。
- 登录页空密码框显示 10 个圆点，看起来像已填过；改为文字占位。
- 触屏上出现「Enter to capture」「press 1–4」；按指针类型区分文案。
- 移动端首屏因为外壳与整屏路由**重复预留**底部导航高度，多出 93px 滚动。
- 装饰性光斑在标题后像一块污渍；降低不透明度并移出。
- 进度条轨道在纸色上对比度仅 ~1.06:1，几乎看不见。
- 截图工具本身有 viewport 传参 bug：`width/height` 传在顶层被忽略，
  导致**移动端截图实际是 1280×720 桌面渲染**，移动端从未被真正看过。

### 第三轮：配色切换 + 布局回归修复
- **新增主题系统**：`Violet`（极简白紫，**默认**）与 `Paper`（暖纸墨色）。
  所有颜色令牌经 `@theme inline` 映射到 `--t-*`，一个 `data-theme` 属性即可整体换肤；
  阴影同样按主题切换。`index.html` 内联脚本在首帧前应用，避免闪色。
  入口：顶栏半圆按钮 + 账号菜单；localStorage 持久化；`theme-color` 同步。
  两套色板均按对比度实测（白紫：正文 16.8:1 / 次级 8.2:1 / 三级 5.0:1）。
- **修复全屏路由的布局回归**（此前把 `calc()` 高度改成 flex 导致）：
  - 复习卡片塌成 0px —— 卡片内部有 4 层 `h-full`，百分比在
    「高度为 auto 的 flex item」上无法解析。恢复确定高度并把 footer 纳入预算。
  - 全屏路由作为 flex item 时 `margin-inline: auto` 会触发 shrink-to-fit，
    整列缩到 243px；补 `width: 100%`。
  - 顶栏 1px 下边框未计入预算 → 首屏恒有 1px 滚动 → sticky 顶栏裁掉首行。
  - 卡片背后两张装饰性「下一张」预览用 `aspect-[3/4]` 定位，矮窗口下溢出撑高文档。
- **修复按钮居中**：`.btn` 是 `inline-flex`，行内级盒子的 `margin: auto` 被忽略，
  导致「Show answer」比卡片偏左约 190px；`.btn-block` 改为 `display: flex`。
- 手写画布保留自身纸质调色（导出图必须与手写所见一致），仅其元素底色跟随主题。

### 验证
- 新增可复现的量测工具 `frontend/scripts/design/`（DOM/对比度/目标尺寸/溢出/
  字阶/色板/层级/motion + 截图像素分析）。
- 全路由 × 桌面 1440 / 移动 390（触控模拟）× 关键交互态，
  **两套主题各 22 项**：对比度失败 0、过小点击目标 0、横向溢出 0、每页恰好一个 h1。
- 整屏路由在 390/641/768/900/1024/1280/1440 七种视口下**精确等于视口高度**
  （零滚动、零裁切），卡片比例 0.73（≈3:4）。
- `tsc -b --noEmit`、`eslint .`、`vitest run`（27 项）全绿；交互冒烟（翻卡→评分→
  换卡、搜索、行菜单、账号菜单、`/` 快捷键）全部通过，无页面报错。

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