# ScholarInbox

ScholarInbox 是一个自托管的个人论文发现与阅读网页应用，目标是每天自动追踪和研究方向相关的新论文，减少手动刷 arXiv 的时间。

当前项目处于设计基线阶段，应用代码尚未开始实现。

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

## 计划技术栈

- Next.js
- TypeScript
- SQLite
- 系统 `sqlite3` 命令行工具
- arXiv API
- Docker 部署

## 数据与隐私

ScholarInbox 面向个人服务器部署。论文元数据、阅读状态、收藏和解析结果默认保存在服务器本地数据库中。

API key、`.env` 文件、本地数据库、日志和构建产物不会提交到 GitHub。

## 当前状态

已完成需求和架构设计文档：

- `architecture.md`
- `AGENT.md`
- `docs/superpowers/specs/2026-06-02-scholar-inbox-design.md`

下一步是根据设计文档创建实施计划，然后开始实现第一版抓取和论文列表流程。
