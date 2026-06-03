# Architecture

This document defines the intended structure and module boundaries for ScholarInbox. Update it whenever directories, file placement rules, database schema, service boundaries, or dependency rules change.

## Product Shape

ScholarInbox is a self-hosted personal paper discovery and reading app.

The app owns four main workflows:

- crawl papers from external sources
- filter papers against the user's research interests
- support paper lifecycle status, archive organization, favorites, and user-defined tags
- run crawl-time and detail-page paper analysis

## Planned Stack

- Next.js App Router for pages and API routes.
- React and TypeScript for the frontend.
- SQLite for persistence.
- A small server-only SQLite wrapper around the system `sqlite3` command, following `/data/proj/phd-workspace`.
- arXiv API as the first paper source.
- Cron-style server-side scheduling for daily crawls.
- Docker-compatible deployment.

## Planned File Tree

```text
ScholarInbox/
  README.md
  AGENT.md
  architecture.md
  package.json
  next.config.mjs
  tsconfig.json
  .env.example
  .gitignore

  app/
    layout.tsx
    page.tsx
    globals.css
    dashboard/page.tsx
    archive/page.tsx
    papers/page.tsx
    papers/[id]/page.tsx
    favorites/page.tsx
    crawls/page.tsx
    settings/page.tsx
    api/
      ai/test/route.ts
      papers/route.ts
      papers/[id]/route.ts
      papers/[id]/favorite/route.ts
      papers/[id]/note/route.ts
      papers/[id]/status/route.ts
      papers/[id]/user-tags/route.ts
      user-tags/route.ts
      crawls/route.ts
      crawls/manual/route.ts
      settings/route.ts

  components/
    app-shell/
    papers/
    crawls/
    settings/
    ui/

  lib/
    db/
      schema.ts
      database.ts
    papers/
      repository.ts
      types.ts
    sources/
      arxiv.ts
      types.ts
    crawls/
      crawler.ts
      date-range.ts
      scheduler.ts
      repository.ts
    filtering/
      profile.ts
      llm-filter.ts
      keyword-filter.ts
    analysis/
      analyzer.ts
      repository.ts
    settings/
      repository.ts
    ai/
      client.ts
      types.ts
    time/
      server-date.ts

  docs/
    superpowers/
      plans/
      specs/

  scripts/
    daily-crawl-scheduler.mjs
    start-dev.sh
    start.sh

  tests/
    *.test.ts
    *.test.mjs
```

Create folders as they become necessary. Do not add empty directories just to match the planned tree.

## Layer Rules

### `app/`

Owns Next.js routing, page entry points, and HTTP route handlers.

- Pages compose server and client components.
- API routes validate requests and call server-side services.
- Business rules should live in `lib/**`, not directly inside route handlers.

### `components/`

Owns React UI components.

- Components may call API routes or receive data through props.
- Components must not import database clients, source crawlers, or server-only AI clients.
- Shared controls belong in `components/ui`.
- Paper-specific UI belongs in `components/papers`.

### `lib/db/`

Owns database path resolution, CLI-backed SQLite execution, schema creation, and low-level query setup.

- Database files are runtime data and must not be committed.
- The project uses the system `sqlite3` CLI rather than a native Node SQLite driver.
- Do not introduce Drizzle, Prisma, `better-sqlite3`, or another database package for the MVP.
- Schema changes must be reflected in this document when they alter project structure or major data ownership.

### `lib/sources/`

Owns external paper source adapters.

- arXiv is the first source.
- Source adapters normalize external records into internal paper input types.
- UI and repositories should not depend on source-specific response shapes.

### `lib/crawls/`

Owns crawl orchestration.

- Manual date-range crawl and scheduled daily crawl should share the same core service.
- Scheduled daily crawl is managed by `scripts/daily-crawl-scheduler.mjs`, which is started and cleaned up by `scripts/start.sh` and `scripts/start-dev.sh`.
- The scheduler reads persisted `dailyCrawlTime`, compares it with server-local `HH:mm`, skips already completed or running same-day scheduled ranges, and calls the local `/api/crawls/manual` endpoint with `trigger: "scheduled"`.
- Scheduled crawls target the previous server-local date.
- Date ranges with identical start and end dates are valid and represent that full submitted-date day.
- Crawl runs must record status and counts.
- Deduplication belongs in the persistence path.

### `lib/filtering/`

Owns interest profile matching.

- Filtering uses paper title and abstract.
- Results store whether a paper matched and optionally a score.
- Results do not store natural-language reasons.
- Local keyword/category prefiltering only removes clearly unrelated papers before model calls.
- Batch LLM filtering is the final positive-match decision for papers that pass prefiltering.
- LLM results are hardened by a server-side score threshold; low-score results are unmatched even if the model marks them matched.
- The papers API defaults to matched papers, while favorite queries can still return saved favorites regardless of match state.
- `irrelevant` paper status is user feedback for future filtering calibration.

### `lib/analysis/`

Owns single-paper parsing and analysis.

- Crawl-time homepage analysis runs for every matched paper that does not already have Chinese analysis.
- Crawl-time PDF detail analysis runs for every matched paper that does not already have a PDF reading guide.
- Detail-page PDF analysis action refreshes or backfills a single paper and stores the same richer reading guide.
- Analysis output structure can continue to be refined from user reading feedback.

### `lib/settings/`

Owns persisted non-secret settings.

- Research interest profile text can be persisted.
- arXiv categories and crawl time can be persisted.
- API keys must stay in environment variables or a server-only secret mechanism.
- Runtime filtering reads the local private Markdown preference file when present; if it is absent, `lib/user-preferences/research-interest.ts` provides a narrow built-in default. The private preference file is not tracked by Git.

## Data Model Outline

Expected core entities:

- `papers`: normalized paper metadata plus persisted interest-filter result fields.
- `crawl_runs`: each manual or scheduled crawl.
- `filter_profiles`: saved research-interest descriptions.
- `filter_results`: per-paper match result for a profile.
- `paper_states`: compact lifecycle status (`new`, `skipped`, `archived`, `irrelevant`), favorite flag, and the user's per-paper note. `skipped` is direction-consistent but not part of the archive knowledge base; `irrelevant` is calibration feedback.
- `user_tags`: user-defined colored labels for personal knowledge-base organization.
- `paper_user_tags`: many-to-many assignments between papers and user-defined tags.
- `paper_analysis`: single-paper analysis results.
- `app_settings`: non-secret app settings.

## Security And Privacy

- API keys must never be exposed to client components.
- `.env` and local database files must not be committed.
- Runtime data is server-local unless the user later requests sync/export features.

## Current Status

The current MVP includes:

- `lib/db/database.ts`: CLI-backed SQLite wrapper using the system `sqlite3` command.
- `lib/db/schema.ts`: schema creation for papers, paper states, user tags, paper-tag assignments, crawl runs, and app settings.
- `lib/db/app-database.ts`: app database initialization helper.
- `lib/papers/repository.ts`: paper upsert, deduplication, list, detail, favorite, user note, compact status, and user-tag persistence.
- `lib/sources/arxiv.ts`: arXiv query URL builder, fetcher, Atom parser, single-connection 3-second request throttle, and transient 429/5xx retry handling.
- `lib/crawls/crawler.ts`: shared date-range arXiv crawl orchestration for manual and scheduled runs.
- `lib/crawls/date-range.ts`: manual preset and scheduled previous-day date-range helpers.
- `lib/crawls/scheduler.ts`: daily scheduled crawl tick logic, duplicate-run guard, and interval lifecycle.
- `lib/crawls/repository.ts`: crawl run persistence.
- `lib/settings/repository.ts`: persisted categories, daily crawl time, and interest profile text.
- `lib/ai/client.ts`: server-only OpenAI-compatible Responses API connection test helper.
- `lib/filtering/**`: local prefiltering, interest profile hashing, batched Responses API filtering, and streaming SSE text parsing.
- `app/api/**`: dynamic API routes for papers, favorites, user notes, statuses, user tags, crawls, manual crawl, settings, and AI API testing.
- `components/papers/**`: paper list, archive/favorites views, detail view, controlled status select, favorite button, AI keyword tags, user-defined tag picker, and auto-saving user note editor.
- `components/sync/SyncStatusProvider.tsx`: global optimistic-write status provider and sticky-header save status badge.
- `components/crawls/ManualCrawlForm.tsx`: manual date-range crawl UI, defaulting to the most recent 7 UTC dates.
- `components/settings/SettingsForm.tsx`: crawl settings and API test UI, shown on `/crawls`.
- `scripts/daily-crawl-scheduler.mjs`: script-managed daily scheduler that triggers scheduled crawls through the local API without opening another port.
- `scripts/start-dev.sh` and `scripts/start.sh`: compiled-run helpers for local testing and personal-server use; they start Next and the scheduler together and clean both up on exit.
- `docs/user-preferences/research-interest.md`: local private research-interest boundary for filter prompts and future calibration. It is intentionally ignored by Git.
