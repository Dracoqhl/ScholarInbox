# AGENT.md

This file stores maintainer context for future Codex sessions. It is project memory, not user-facing documentation.

## Project

- Product name: ScholarInbox.
- Repository: `git@github.com:Dracoqhl/ScholarInbox.git`.
- Stage: first testable MVP implementation.
- Primary user: the repository owner, using the app on a personal server.
- Product positioning: self-hosted personal paper discovery, filtering, reading, and favorites.
- The app should not depend on GitHub Actions, GitHub Pages, or a GitHub-centered paper workflow.

## Confirmed Product Decisions

- Default technical stack: Next.js, TypeScript, SQLite through the system `sqlite3` CLI wrapper, arXiv API, cron-style scheduling, Docker-friendly deployment.
- Follow `/data/proj/phd-workspace` for the local Next.js, pnpm, Tailwind, Vitest, and SQLite access style.
- Do not introduce `better-sqlite3`, Drizzle ORM, Prisma, PostgreSQL, MySQL, Redis, or another database service unless the user explicitly asks for it later.
- Initial paper source: arXiv.
- Initial arXiv categories: `cs.CL`, `cs.AI`, `cs.LG`, configurable later in the web UI.
- Support two crawl modes: daily scheduled crawl and manual date-range crawl.
- Interest filtering uses paper title and abstract.
- Interest filtering does not need to generate or store natural-language reasons.
- Filter results should store `matched` and may store an optional `score`.
- The user currently cares about large language model post-training, model reasoning, test-time scaling, RLHF/DPO/RLAIF, agentic RL, tool use, and multi-agent reasoning.
- Add a paper favorite feature so high-value papers can be revisited later.
- Favorite state is independent from reading status.
- Early parsing/testing should fully parse only one selected paper. Do not batch-parse papers during the initial debug phase.
- API keys and secrets must stay server-side and must not be committed.
- Current MVP can manually crawl arXiv date ranges, store and deduplicate papers in SQLite, list papers, update reading status, save favorites, and edit basic settings.
- Settings UI includes a `测试 API` button backed by `POST /api/ai/test`. It tests server-side `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY` through an OpenAI-compatible `/responses` call.
- Current MVP stores the interest profile text but does not yet execute LLM filtering.
- Current MVP does not yet implement daily scheduled crawl or single-paper PDF analysis.

## Documentation Rules

- Maintain `README.md` as Chinese user-facing documentation.
- Maintain `architecture.md` for project structure, module boundaries, data flow, and dependency rules.
- Maintain this `AGENT.md` for user preferences, collaboration rules, product decisions, and future-agent context.
- After user feedback, explicitly check whether `README.md`, `architecture.md`, and `AGENT.md` need updates.
- Keep documentation updates in the same development round as behavior or architecture changes.

## Collaboration Rules

- Each completed and verified development round should be committed and pushed to GitHub.
- Before considering a round finished, check `git status`, run relevant verification, update required docs, commit, and push.
- Do not commit runtime databases, `.env` files, logs, build outputs, or API keys.
- Prefer small, well-bounded modules over large mixed-responsibility files.
- Follow existing project structure once implementation begins.

## MVP Order

1. Project skeleton and documentation baseline.
2. SQLite schema and CLI-backed database wrapper.
3. arXiv manual date-range crawl.
4. Paper storage and deduplication.
5. Basic paper list UI.
6. Favorite persistence and UI toggle.
7. Interest profile settings and filtering.
8. Daily scheduled crawl.
9. Single-paper analysis entry point.

## Runtime Notes

- Use `./scripts/start-dev.sh` for local compiled-run testing. It defaults to `PORT=3120`, `BIND_HOST=127.0.0.1`, and `DATABASE_PATH=$PWD/data/scholar-inbox.sqlite`.
- Use `./scripts/start.sh` for personal-server access. It defaults to `BIND_HOST=0.0.0.0`.
- API routes must remain `force-dynamic`; otherwise Next may evaluate database-backed routes at build time.
- Do not commit `data/`, `.env.local`, `.next/`, or runtime SQLite files.
