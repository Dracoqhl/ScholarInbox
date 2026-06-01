# ScholarInbox MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first testable ScholarInbox MVP that can crawl arXiv papers for a date range, store them in SQLite, show them in a web UI, persist reading status and favorites, and expose basic settings.

**Architecture:** Use a single Next.js App Router application. Server-only modules own arXiv fetching, SQLite access, crawl orchestration, and settings; React components call route handlers and never import database or crawler code directly.

**Tech Stack:** Next.js, React, TypeScript, SQLite through the system `sqlite3` CLI, Vitest, Tailwind CSS, arXiv Atom API.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `next.config.mjs`
- Create: `tsconfig.json`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `.eslintrc.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`

- [ ] Create the Next.js project files with scripts for `dev`, `build`, `start`, `lint`, and `test`.
- [ ] Use the same package style as `/data/proj/phd-workspace`.
- [ ] Do not add `better-sqlite3`, Drizzle, Prisma, or any external database service.
- [ ] Use runtime dependencies: `next`, `react`, `react-dom`, `zod`, `lucide-react`.
- [ ] Use dev dependencies: `typescript`, `tailwindcss`, `postcss`, `autoprefixer`, `eslint`, `eslint-config-next`, `vitest`, `@types/node`, `@types/react`, `@types/react-dom`.
- [ ] Add a minimal App Router shell that renders a working page.
- [ ] Run `pnpm install` only when dependencies are missing or `node_modules` needs to match `package.json`.
- [ ] Run `pnpm build`; expected result: build succeeds.

### Task 2: Database And Domain Foundation

**Files:**
- Create: `lib/db/schema.ts`
- Create: `lib/db/database.ts`
- Create: `lib/db/init.ts`
- Create: `lib/papers/types.ts`
- Create: `lib/papers/repository.ts`
- Create: `tests/papers-repository.test.ts`

- [ ] Write tests for paper upsert deduplication and favorite/status persistence.
- [ ] Run `pnpm test tests/papers-repository.test.ts`; expected result: fails because repository code does not exist.
- [ ] Implement SQLite schema and repository functions.
- [ ] Run `pnpm test tests/papers-repository.test.ts`; expected result: tests pass.

### Task 3: arXiv Source And Crawl Service

**Files:**
- Create: `lib/sources/types.ts`
- Create: `lib/sources/arxiv.ts`
- Create: `lib/crawls/types.ts`
- Create: `lib/crawls/repository.ts`
- Create: `lib/crawls/crawler.ts`
- Create: `tests/arxiv.test.ts`
- Create: `tests/crawler.test.ts`

- [ ] Write tests for arXiv Atom parsing using a local XML fixture.
- [ ] Write tests that crawl service inserts fetched papers and records counts.
- [ ] Run targeted tests; expected result: fail before implementation.
- [ ] Implement arXiv client, parser, crawl run repository, and crawl orchestration.
- [ ] Run targeted tests; expected result: tests pass.

### Task 4: API Routes

**Files:**
- Create: `app/api/papers/route.ts`
- Create: `app/api/papers/[id]/route.ts`
- Create: `app/api/papers/[id]/favorite/route.ts`
- Create: `app/api/papers/[id]/status/route.ts`
- Create: `app/api/crawls/route.ts`
- Create: `app/api/crawls/manual/route.ts`
- Create: `app/api/settings/route.ts`
- Create: `lib/settings/repository.ts`
- Create: `lib/validation/http.ts`

- [ ] Add route handlers for listing papers, reading detail, toggling favorites, changing status, running manual crawl, listing crawl runs, and reading/updating settings.
- [ ] Validate incoming JSON with `zod`.
- [ ] Ensure route handlers call only server-side `lib/**` modules.
- [ ] Run `pnpm build`; expected result: route handlers compile.

### Task 5: MVP UI

**Files:**
- Modify: `app/page.tsx`
- Create: `app/papers/page.tsx`
- Create: `app/papers/[id]/page.tsx`
- Create: `app/favorites/page.tsx`
- Create: `app/crawls/page.tsx`
- Create: `app/settings/page.tsx`
- Create: `components/app-shell/AppShell.tsx`
- Create: `components/papers/PaperList.tsx`
- Create: `components/papers/PaperDetail.tsx`
- Create: `components/papers/FavoriteButton.tsx`
- Create: `components/crawls/ManualCrawlForm.tsx`
- Create: `components/settings/SettingsForm.tsx`
- Create: `components/ui/StatusSelect.tsx`

- [ ] Build a quiet product UI suitable for repeated scanning and reviewing papers.
- [ ] Provide navigation for papers, favorites, crawls, and settings.
- [ ] Add manual date-range crawl form.
- [ ] Add paper list with search, matched-only/favorites filters, status select, and favorite toggle.
- [ ] Add paper detail page with metadata and external links.
- [ ] Add settings form for categories, daily crawl time, and interest profile text.
- [ ] Run `pnpm build`; expected result: production build succeeds.

### Task 6: Documentation And Deployment Helpers

**Files:**
- Modify: `README.md`
- Modify: `architecture.md`
- Modify: `AGENT.md`
- Create: `scripts/start-dev.sh`
- Create: `scripts/start.sh`

- [ ] Document setup, environment variables, scripts, and MVP limitations in Chinese.
- [ ] Update architecture to reflect implemented files and module boundaries.
- [ ] Update AGENT with the current implementation state and collaboration notes.
- [ ] Add start scripts for development and personal-server production.
- [ ] Run `pnpm lint`, `pnpm test`, and `pnpm build`; expected result: all pass.
- [ ] Commit and push the MVP branch.
