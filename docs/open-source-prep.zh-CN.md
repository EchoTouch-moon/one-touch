# 开源前准备清单

目标：在继续保留私有内测环境的前提下，整理一份可以公开的代码副本。

## 推荐策略

保留两个仓库：

1. 私有仓库：继续跑内测，保留真实域名、备案号、服务器部署细节和本地数据。
2. 公开仓库：只放通用产品代码、示例配置和脱敏文档。

不要把当前内测仓库直接切成 public。更稳妥的方式是从私有仓库导出一个干净副本，再推送到新的 GitHub public repository。

## 必须排除

- `.env`、真实 API Key、SMTP 密码、管理员密码。
- `words.db`、SQLite WAL/SHM 文件、备份文件。
- `logs/`、`*.log`、`*.jsonl`。
- `stylus-diagnostics-*.json`、诊断截图、真实用户截图。
- 个人文件，例如简历、非项目笔记。
- 私有部署域名、服务器 IP、证书路径、备案号。

## 公开仓库可以保留

- 后端、前端核心代码。
- `.env.example`。
- Dockerfile、通用 Docker Compose 示例。
- 技术文档、路线图、部署清单。
- PWA 图标和产品截图，但截图不能包含真实用户数据。

## README 口径

公开版建议定位为：

> 一触是一个自托管、平板手写优先的英语单词记忆与复习系统，目前处于 beta 阶段。

避免承诺“生产稳定可商用”。更合适的是强调：

- 手写释义卡。
- SM-2 间隔重复。
- 离线复习队列。
- 可选 LLM enrich。
- 自托管部署。

## License 建议

如果主要目标是展示作品、让别人学习和试用，建议 MIT。

如果你担心别人直接拿去做闭源商业化服务，可以考虑 AGPL-3.0。但 AGPL 会提高外部贡献和使用门槛。

## 导出公开副本

运行：

```bash
python3 scripts/export_open_source.py /path/to/glm-words-public
```

脚本会创建一个脱敏副本，并排除运行时数据和个人文件。导出后仍建议手动检查：

```bash
cd /path/to/glm-words-public
rg -n "moonpulse|82\\.157|鲁ICP备|DOUBAO_API_KEY|SMTP_PASSWORD|AUTH_SECRET|sk-"
find . -name "*.db" -o -name "*.log" -o -name "*.jsonl"
```
