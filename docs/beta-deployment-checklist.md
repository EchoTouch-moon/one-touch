# 内测部署检查清单

更新时间：2026-05-22

## 必做项

- 轮换已经在聊天或文档中暴露过的 Ark / LLM API Key。
- 设置强 `GLM_WORDS_AUTH_SECRET`，建议使用：

```bash
openssl rand -hex 32
```

- 设置强管理员密码：

```bash
GLM_WORDS_ADMIN_USERNAME=your-admin-email
GLM_WORDS_ADMIN_PASSWORD=long-random-password
```

- 开启 HTTPS。
  - 浏览器到服务器之间必须加密。
  - 否则抓包可看到用户 Bearer token、复习数据和 AI enrich 请求内容。

- 确认反向代理不记录敏感 header。
  - 不记录 `Authorization`。
  - 不记录完整请求体。
  - 不把 `.env`、数据库、备份目录暴露为静态文件。

- 仅在服务器环境变量里配置 LLM Key：

```bash
GLM_WORDS_LLM_PROVIDER=doubao
GLM_WORDS_LLM_MODEL=doubao-seed-2-0-pro-260215
GLM_WORDS_DOUBAO_API_KEY=your-rotated-ark-key
GLM_WORDS_LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
GLM_WORDS_ENRICH_DAILY_LIMIT=5
```

- 如需开放邮箱验证码注册，设置：

```bash
GLM_WORDS_REGISTRATION_ENABLED=true
GLM_WORDS_REGISTRATION_MAX_USERS=30
GLM_WORDS_EMAIL_VERIFICATION_TTL_MINUTES=10
```

- 生产发送验证码建议配置 SMTP：

```bash
GLM_WORDS_MAIL_PROVIDER=smtp
GLM_WORDS_SMTP_HOST=smtp.example.com
GLM_WORDS_SMTP_PORT=587
GLM_WORDS_SMTP_USERNAME=your-smtp-user
GLM_WORDS_SMTP_PASSWORD=your-smtp-password
GLM_WORDS_SMTP_FROM=no-reply@moonpulse.online
GLM_WORDS_SMTP_TLS=true
```

未配置 SMTP 时会使用 `console` 模式，验证码只写入后端日志，适合本地调试，不适合正式内测。

- 找回密码同样依赖上述邮箱验证码通道。
  - 只会更新 `users.password_hash`。
  - 不会删除用户的词库、复习记录、手写数据或同步数据。

## 建议项

- 开启备份：

```bash
GLM_WORDS_BACKUP_ENABLED=true
GLM_WORDS_BACKUP_RETENTION_DAYS=7
```

- Admin / Settings / Runtime 检查：
  - DB 显示正常。
  - Backup 状态符合预期。
  - LLM provider/model 正确。
  - AI enrich health 能看到最近事件。

- 第一批内测限制在 20-30 人。
- 每天观察：
  - AI enrich 失败数。
  - AI enrich 平均耗时。
  - 用户反馈。
  - 备份是否生成。
  - 服务器磁盘占用。

## 当前已知安全边界

- LLM API Key 不下发前端。
- 普通用户每日 AI enrich 默认 5 次。
- 管理员不限量。
- 登录 token 当前存储在 `localStorage`。
  - 内测可接受。
  - 长期建议改为 HttpOnly Secure Cookie。

## 部署后快速验证

```bash
curl https://your-domain/api/health
```

登录管理员账户后检查：

- Settings / Admin / Runtime
- Settings / Admin / AI enrich health
- Settings / LLM / AI enrich quota

普通用户检查：

- 无法访问 `/api/ops/status`
- AI enrich 到 5 次后返回 429
- 抓包看不到 Ark API Key
