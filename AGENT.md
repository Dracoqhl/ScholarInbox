# AGENT.md

This file stores maintainer context for future Codex sessions. It is project memory, not user-facing documentation.

## Project

- Product name: ScholarInbox.
- Repository: `git@github.com:Dracoqhl/ScholarInbox.git`.
- Stage: first testable MVP implementation.
- Primary user: the repository owner, using the app on a personal server.
- Product positioning: self-hosted personal paper discovery, filtering, reading, archiving, and favorites.
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
- Interest filtering uses local high-recall prefiltering to skip clearly unrelated papers, then batched AI filtering as the final positive-match decision.
- Batched AI filtering uses a strict score threshold: scores below 0.65 are treated as unmatched even if the model says `matched: true`.
- User research-interest boundaries are maintained in `docs/user-preferences/research-interest.md`, not only in the settings UI text.
- If AI configuration is unavailable or filtering fails, crawl filtering should fail visibly rather than silently falling back to non-AI matching.
- The user currently cares about large language model post-training, model reasoning, test-time scaling, RLHF/DPO/RLAIF, agentic RL, tool use, and multi-agent reasoning.
- Paper lifecycle status is intentionally compact: `new`, `skipped`, `archived`, and `irrelevant`.
- `skipped` / `略过` means the paper is broadly direction-consistent but should not enter the archive knowledge base for now; it is not a filtering-calibration signal.
- Favoriting a paper marks it as high-importance and automatically moves it into `archived`; favorites are a priority flag over archived papers, not a separate lifecycle.
- Legacy states such as `general`, `interested`, `reading`, and `done` should be normalized to `archived`.
- AI keyword tags are generated from paper analysis and stored separately from user-defined tags.
- User-defined tags are colored, many-to-many paper labels for personal knowledge-base organization. They can be applied from the homepage and detail page, and used for archive filtering.
- Each paper can have one user note/comment for favorite reasons, irrelevant-direction reasons, or reading reminders. This is user state and is stored with `paper_states`.
- Paper note editing should use optimistic local updates and debounced auto-save, following `/data/prod/phd-workspace/components/notes/QuickNotesPanel.tsx`; do not add a separate save button.
- User-write save state should be shown globally in the sticky app header, not repeated inside each paper note editor.
- New matched papers should receive both homepage Chinese analysis and PDF-based detail analysis during crawl; the detail-page PDF action is for refresh or backfill.
- API keys and secrets must stay server-side and must not be committed.
- Current MVP can manually crawl arXiv date ranges, run daily scheduled arXiv crawls, filter papers against the interest profile, store and deduplicate papers in SQLite, list matched papers, update paper lifecycle status, save favorites, apply user-defined tags, and edit crawl/AI settings.
- Paper status includes `irrelevant` / `方向无关`. Before future filtering changes, check whether such papers exist and discuss calibration with the user before introducing broader filters.
- `/archive` is the knowledge-base organization page. It lists archived papers, including favorites, and supports filtering by user-defined tags, AI keyword tags, and paper publication date.
- `/settings` redirects to `/crawls`; crawl-related settings, API testing, and manual crawling are merged into `/crawls`.
- Manual arXiv crawls default to the most recent 7 UTC dates because same-day `submittedDate` queries can return zero before arXiv publishes the latest batch.
- Same-day date ranges are valid: `dateFrom` equal to `dateTo` means the full submitted-date window from local input `00:00` to `23:59`.
- Daily scheduled crawl is managed by `scripts/daily-crawl-scheduler.mjs`, which is started and cleaned up by `scripts/start.sh` and `scripts/start-dev.sh`. It reads `dailyCrawlTime`, compares it against the server's local `HH:mm`, skips already completed/running same-day ranges, and calls the local `/api/crawls/manual` endpoint with `trigger: "scheduled"` for the previous server-local date.
- arXiv legacy API requests must stay single-connection with at least 3 seconds between requests; the source fetcher includes in-process throttling and limited 429/5xx retries.
- Settings UI includes a `测试 API` button backed by `POST /api/ai/test`. It tests server-side `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY` through an OpenAI-compatible `/responses` call.
- PDF detail analysis runs automatically for matched crawl results and can be refreshed from the paper detail page.

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
9. Paper analysis entry points and crawl-time analysis.

## Runtime Notes

- Use `./scripts/start-dev.sh` for local compiled-run testing. It defaults to `PORT=3120`, `BIND_HOST=127.0.0.1`, and `DATABASE_PATH=$PWD/data/scholar-inbox.sqlite`.
- Use `./scripts/start.sh` for personal-server access. It defaults to `BIND_HOST=0.0.0.0`.
- API routes must remain `force-dynamic`; otherwise Next may evaluate database-backed routes at build time.
- Set `SCHOLAR_INBOX_DISABLE_SCHEDULER=1` to disable the script-managed daily scheduler during isolated tests or one-off commands.
- Do not commit `data/`, `.env.local`, `.next/`, or runtime SQLite files.
