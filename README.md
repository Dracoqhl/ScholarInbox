# ScholarInbox

ScholarInbox 是一个自托管的个人论文发现与阅读网页应用，目标是每天自动追踪和研究方向相关的新论文，减少手动刷 arXiv 的时间。

当前项目已经有第一版可测试 MVP：可以手动抓取 arXiv 日期范围论文、写入本地 SQLite、查看论文列表、修改阅读状态、收藏论文，并保存基础设置。

## 目标

- 每天定时抓取新论文。
- 支持按日期范围手动批量抓取。
- 根据用户填写的研究兴趣，基于标题和摘要筛选论文。
- 在网页中查看论文列表、详情、阅读状态和收藏。
- 调试阶段只完整解析一篇论文，避免批量解析浪费时间和 API 成本。

## 初始研究方向

默认会围绕以下方向设计筛选流程：

- 大语言模型后训练
- 模型推理
- test-time scaling
- RLHF / DPO / RLAIF
- agentic RL
- tool use
- multi-agent reasoning

研究兴趣会在网页设置中可编辑。

## 技术栈

- Next.js
- TypeScript
- SQLite
- 系统 `sqlite3` 命令行工具
- arXiv API

## 本地启动

先安装依赖：

```bash
pnpm install
```

复制环境变量示例：

```bash
cp .env.example .env.local
```

至少设置 `DATABASE_PATH`。它必须是绝对路径，例如：

```bash
DATABASE_PATH=/data/ScholarInbox/data/scholar-inbox.sqlite
```

启动可测试版本：

```bash
./scripts/start-dev.sh
```

默认监听：

```text
http://127.0.0.1:3120
```

如果需要从服务器外部访问，可以设置：

```bash
BIND_HOST=0.0.0.0 PORT=3120 ./scripts/start.sh
```

## MVP 使用流程

1. 打开 `/settings`，确认 arXiv 分类和兴趣筛选文本。
2. 打开 `/crawls`，选择日期范围，点击开始抓取。
3. 回到 `/papers` 或首页查看论文。
4. 在列表里修改阅读状态，或点击星标收藏。
5. 打开 `/favorites` 回顾收藏论文。
6. 在 `/settings` 点击 `测试 API` 检查 `.env.local` 中的模型 API 配置是否可用。

当前版本会保存兴趣筛选文本，但还没有执行 LLM 筛选；后续版本会基于标题和摘要只保留匹配论文，不写筛选原因。

## 数据与隐私

ScholarInbox 面向个人服务器部署。论文元数据、阅读状态、收藏和解析结果默认保存在服务器本地数据库中。

API key、`.env` 文件、本地数据库、日志和构建产物不会提交到 GitHub。

## 当前状态

已完成：

- `architecture.md`
- `AGENT.md`
- `docs/superpowers/specs/2026-06-02-scholar-inbox-design.md`
- arXiv 手动日期范围抓取
- SQLite 入库和去重
- 论文列表、详情、阅读状态和收藏
- 设置页

下一步是接入兴趣筛选和每日定时抓取。
