# ScholarInbox

ScholarInbox 是一个自托管的个人论文发现与阅读网页应用，目标是每天自动追踪和研究方向相关的新论文，减少手动刷 arXiv 的时间。

当前项目已经有第一版可测试 MVP：可以手动抓取 arXiv 日期范围论文、用本地预筛和批量 AI 终筛匹配研究兴趣、写入本地 SQLite、查看匹配论文列表、修改阅读状态、收藏论文，并保存基础设置。

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

1. 打开 `/crawls`，确认 arXiv 分类，并点击 `测试 API` 确认 AI 配置可用。
2. 在同一页面确认日期范围，点击开始抓取。手动抓取默认选择最近 7 天，避免 arXiv 当天尚未发布新条目时返回空结果。
3. 回到 `/papers` 或首页查看匹配兴趣方向的论文。
4. 在列表里修改阅读状态，或点击星标收藏。
5. 打开 `/favorites` 回顾收藏论文。
6. 在 `/settings` 点击 `测试 API` 检查 `.env.local` 中的模型 API 配置是否可用；当前连通性测试使用 Responses API。

抓取时会先用本地规则排除明显无关论文，再把可能相关论文按批次交给 AI 判断。过滤结果会保存到数据库，`/papers` 默认只显示匹配当前兴趣方向的论文，并按匹配分数优先排序，不保存自然语言筛选原因。

研究兴趣边界维护在 `docs/user-preferences/research-interest.md`。如果你在论文列表里把论文标记为 `方向无关`，后续过滤优化应先查看这些标注并讨论如何校准兴趣边界。

arXiv 抓取会遵守 legacy API 的访问限制：同一进程内串行请求，每次请求之间至少间隔 3 秒，并对 429/5xx 临时错误做有限重试。

## 数据与隐私

ScholarInbox 面向个人服务器部署。论文元数据、阅读状态、收藏和解析结果默认保存在服务器本地数据库中。

API key、`.env` 文件、本地数据库、日志和构建产物不会提交到 GitHub。

## 当前状态

已完成：

- `architecture.md`
- `AGENT.md`
- `docs/superpowers/specs/2026-06-02-scholar-inbox-design.md`
- arXiv 手动日期范围抓取
- 兴趣筛选、本地预筛、批量 AI 终筛和匹配分数排序
- SQLite 入库和去重
- 论文列表、详情、阅读状态、方向无关标注、收藏和新论文批量清理
- 抓取页和设置页合并

下一步是接入每日定时抓取。
