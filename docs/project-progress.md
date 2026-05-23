# 一触项目进展管理

更新时间：2026-05-22

## 当前定位

一触当前已经从“词汇记录工具”进入“可内测的复习闭环产品”阶段。短期核心目标不是继续堆功能，而是让收词、补释义、复习、数据恢复、AI enrich 这条链路稳定、可控、可解释。

## 当前状态

### 已完成

- 复习闭环 v1
  - Review session 增加短时缓存与预热。
  - Review 首屏从纯 Loading 改为骨架屏。
  - 提交复习后同步修剪本地缓存，减少旧卡片闪现。
  - 后端复习接口补充用户作用域校验，避免跨用户提交。

- 词库与复习准备状态
  - Words 列表显示 `review ready` / `needs definition`。
  - 窄屏列表行布局已优化。
  - Review 空状态有明确下一步引导。
  - Words 列表已接入分页、页码跳转和每页条数选择，避免单词量增长后页面过长。

- Profile / Settings 信息架构
  - `/settings` 统一命名为 Settings。
  - Settings 拆成 `Profile`、`Data`、`LLM`、`Admin`。
  - 删除重复 Feedback 入口，只保留顶部入口。
  - Activity 热力图从 365 天收缩到 84 天，并增加 12 周摘要。

- AI enrich
  - 服务端统一持有 LLM API Key，前端不直接接触 key。
  - 普通用户每日 AI enrich 默认 5 次，管理员不限量。
  - Settings / LLM 显示今日额度。
  - 接入 Doubao / 火山方舟 Ark `responses.create` 调用方式。
  - AI enrich 不再删除手写释义；只替换旧 AI 释义。
  - AI 返回结构收紧为：词性、中文释义、英文例句、中文例句翻译。

- 数据同步与安全边界
  - Sync `replace` 对普通用户只替换自己的数据。
  - Sync `merge` 遇到其他用户已有全局唯一词时跳过，避免唯一约束错误。
  - `/api/auth/config` 收紧，只有管理员能看到具体 LLM model 和 base URL。
  - 生产环境默认弱密码 / 弱 `AUTH_SECRET` 会阻止启动。
  - 备案号已调整为页面底部固定角标，避免在 review 空状态里占据视觉中心。

- 内测注册
  - 登录页主入口保留 `Log in / Register`，找回密码通过 `Forgot password?` 进入。
  - 注册流程改为邮箱验证码：发送验证码后，用邮箱、密码、验证码创建账号。
  - 找回密码流程接入邮箱验证码，只更新密码哈希，不改动用户词库与复习数据。
  - 首次访问和主动退出后会静默清理过期/旧会话请求，不再弹出误导性的 session expired 提示。
  - 服务端增加普通用户总数上限，默认建议限制第一批 20-30 人。
  - SMTP 未配置时验证码写入后端日志，仅适合本地调试。

- 测试与验证
- 后端核心测试已覆盖收词、复习、同步边界、AI enrich 限额、Doubao provider、手写释义共存、邮箱注册、密码重置数据保留。
  - 当前核心测试数量：16 条。
  - 常规验证命令：
    - `uv run python -m pytest backend/tests/test_core_flows.py`
    - `npm run build`
    - `npm run lint`

### Milestone 1 进行中

- 已补方向
  - AI enrich 可观测性：已增加日志字段、耗时记录和 JSONL 汇总。
  - Admin 运行状态卡：已增加后端状态接口和前端 Runtime / AI enrich health 卡片。
  - 安全收口：继续收紧公开配置暴露面。
  - 部署前安全 checklist：已新增 `docs/beta-deployment-checklist.md`。

- 仍待推进
  - 继续补齐 auth / enrich / sync 的接口级测试。
  - 部署前轮换 Ark Key，并确认 HTTPS 与反代配置。

## 当前风险

### 高优先级

- 登录 token 存在 `localStorage`。
  - 内测可接受。
  - 长期建议迁移到 HttpOnly Secure Cookie，降低 XSS 读 token 风险。

- 生产必须启用 HTTPS。
  - 否则抓包可以看到用户 Bearer token、请求内容、复习数据和 AI enrich 请求。
  - 虽然看不到 LLM API Key，但用户会话仍有风险。

- 当前数据库仍是 SQLite。
  - 20-50 人内测较稳。
  - 复习写入、导入导出、手写图片增加后，需要观察锁竞争和备份耗时。

### 中优先级

- AI enrich 调用失败的错误可观测性还不够。
  - 目前前端只显示通用失败提示。
  - 后续需要后台错误分类、失败率统计、provider 响应耗时。

- Settings / LLM 目前是只读和规划态。
  - 暂不建议开放用户提交自己的 API Key。
  - 如果未来做 BYOK，需要服务端加密存储、密钥删除、不可回显、调用审计。

- 用户管理仍偏内测工具。
  - 管理员创建用户可用，但还没有邀请流程统计、用户活跃状态、禁用账号等能力。

## 下一阶段建议

### Milestone 1：内测稳定性收口

目标：支持第一批 20-30 人稳定使用 7-14 天。

建议任务：

- 增加 AI enrich 日志字段：用户、word_id、provider、耗时、成功/失败、错误类型。
- 增加简单健康检查页或 Admin 状态卡：数据库、备份、版本、AI provider 是否配置。
- 补齐 auth / enrich / sync 的接口级测试。
- 部署前轮换已暴露过的 Ark API Key。
- 上线 HTTPS，并确认反向代理不会记录 Authorization header。

### Milestone 2：复习体验继续提速

目标：让每日复习入口稳定、快速、低打扰。

建议任务：

- Review 预取下一组卡片。
- Review 完成页增加“今天还剩 / 明天预计”提示。
- 卡片主展示方式增加明确选择：手写优先 / AI 释义优先 / 指定某条为主释义。
- AI enrich 后自动保持用户当前主释义选择，不强制跳转。

### Milestone 3：数据可靠性

目标：用户知道自己的数据不会丢。

建议任务：

- 导出 JSON 增加版本和恢复说明。
- 导入前增加预检查：将导入多少、跳过多少、是否存在冲突。
- 增加定期备份状态展示。
- 手写图片存储体积监控，评估是否需要对象存储。

### Milestone 4：从 SQLite 走向可扩展架构

触发条件：

- 日活超过 100。
- 同时在线超过 50。
- 复习提交出现明显排队。
- 备份明显变慢。
- 手写数据体积快速增长。

建议方向：

- Postgres 替代 SQLite。
- Alembic 管理迁移。
- 对 AI enrich 增加任务队列，避免长请求阻塞。
- Nginx 静态资源 + API 反代 + HTTPS。

## 内测容量估计

基于 4H4G 腾讯云服务器：

- 第一批建议：20-30 人。
- 稳定后可扩：50-100 人。
- 轻度使用情况下 100-150 DAU 仍可能可行。
- AI enrich 会受到外部模型延迟和日额度影响，不应作为高并发入口。

## 推荐近期执行顺序

1. 部署前安全收口：HTTPS、轮换 Ark Key、强 `AUTH_SECRET`。
2. Admin 状态卡：版本、备份、AI provider、今日 enrich 次数。
3. 主释义选择机制：手写和 AI 共存后，允许明确设置主展示。
4. AI enrich 可观测性：失败原因、耗时、用户用量。
5. 内测 20-30 人，观察 7 天数据。

## 当前文档入口

如果你想快速看懂项目，现在优先看这三份：

1. `docs/project-progress.md`：项目状态、风险、下一阶段。
2. `docs/handwriting-stylus-experience-plan.zh-CN.md`：手写体验路线图。
3. `docs/handwriting-technical-report.zh-CN.md`：手写功能技术说明。

## 常用检查命令

```bash
uv run python -m pytest backend/tests/test_core_flows.py
npm run build --prefix frontend
npm run lint --prefix frontend
python3 -m compileall backend
```

## 决策记录

- LLM API Key 不放前端，不放用户浏览器本地，当前由服务器统一配置。
- 普通用户每日 AI enrich 默认 5 次，管理员不限量。
- 暂不开放 BYOK，避免过早引入密钥加密、删除、审计等复杂度。
- AI enrich 与手写释义共存，不覆盖用户手写内容。
- 当前优先级：稳定性 > 数据安全 > 体验优化 > 扩展性。
