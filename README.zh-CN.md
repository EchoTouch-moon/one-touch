# 一触

> 一触，一词，一卡。✍️

一触是一个以手写释义卡为核心的自托管背单词应用，支持平板手写、SM-2 间隔重复、离线复习和可选 LLM 增强。

**在线体验：** [example.com/settings](https://example.com/settings)

## 亮点

- ✍️ 全屏手写释义卡
- 🧠 SM-2 复习调度
- 📱 手机友好的复习流程
- 📴 离线复习队列
- 🤖 可选 AI enrich
- 🔐 自托管部署

## 截图

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/capture-handwriting.jpg" alt="收词手写" /></td>
    <td width="50%"><img src="docs/screenshots/review-handwritten-card.jpg" alt="复习手写卡" /></td>
  </tr>
</table>

<table>
  <tr>
    <td width="33%"><img src="docs/screenshots/word-detail.jpg" alt="单词详情" /></td>
    <td width="33%"><img src="docs/screenshots/mobile-review.jpg" alt="移动端复习" /></td>
    <td width="33%"><img src="docs/screenshots/settings-runtime.png" alt="运行状态" /></td>
  </tr>
</table>

## 它能做什么

- 快速收词。
- 在手写和键盘输入之间切换。
- 把笔画保存为 `ink_data`，把预览保存为 `canvas_image`。
- 后续在复习里看到同一张手写卡。
- 按需调用 LLM 做 enrich。

## 技术栈

- FastAPI
- SQLAlchemy async ORM
- SQLite
- React
- TypeScript
- Zustand
- Vite

## 快速开始

```bash
cd backend
uv sync

cd ../frontend
npm install
```

复制 `.env.example` 后启动：

```bash
cd backend
uv run uvicorn backend.main:app --reload --port 8000

cd ../frontend
npm run dev
```

## 环境变量

重点变量：

- `GLM_WORDS_ADMIN_USERNAME`
- `GLM_WORDS_ADMIN_PASSWORD`
- `GLM_WORDS_AUTH_SECRET`
- `GLM_WORDS_LLM_PROVIDER`
- `GLM_WORDS_LLM_MODEL`
- `GLM_WORDS_OPENAI_API_KEY`
- `GLM_WORDS_ANTHROPIC_API_KEY`
- `GLM_WORDS_DOUBAO_API_KEY`

## 目录

```text
backend/   API、服务、模型、认证、SRS
frontend/  页面、组件、状态、API
docs/      文档和部署说明
```

## 安全说明

- LLM Key 只放服务端。
- 生产环境使用强密钥。
- 上线时启用 HTTPS。
- 不要提交运行时数据、日志、数据库文件。

## License

MIT
