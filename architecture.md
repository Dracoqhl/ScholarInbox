# Architecture

This document defines the intended structure and module boundaries for ScholarInbox. Update it whenever directories, file placement rules, database schema, service boundaries, or dependency rules change.

## Product Shape

ScholarInbox is a self-hosted personal paper discovery and reading app.

The app owns four main workflows:

- crawl papers from external sources
- filter papers against the user's research interests
- support reading state and favorites
- run single-paper analysis during controlled testing

## Planned Stack

- Next.js App Router for pages and API routes.
- React and TypeScript for the frontend.
- SQLite for persistence.
- Drizzle ORM for schema and typed queries.
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
    papers/page.tsx
    papers/[id]/page.tsx
    favorites/page.tsx
    crawls/page.tsx
    settings/page.tsx
    api/
      papers/route.ts
      papers/[id]/route.ts
      papers/[id]/favorite/route.ts
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
      client.ts
      migrations/
    papers/
      repository.ts
      types.ts
    sources/
      arxiv.ts
      types.ts
    crawls/
      crawler.ts
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
      specs/

  tests/
    unit/
    integration/
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

Owns database connection, schema, migrations, and low-level query setup.

- Database files are runtime data and must not be committed.
- Schema changes must be reflected in this document when they alter project structure or major data ownership.

### `lib/sources/`

Owns external paper source adapters.

- arXiv is the first source.
- Source adapters normalize external records into internal paper input types.
- UI and repositories should not depend on source-specific response shapes.

### `lib/crawls/`

Owns crawl orchestration.

- Manual date-range crawl and scheduled daily crawl should share the same core service.
- Crawl runs must record status and counts.
- Deduplication belongs in the persistence path.

### `lib/filtering/`

Owns interest profile matching.

- Filtering uses paper title and abstract.
- Results store whether a paper matched and optionally a score.
- Results do not store natural-language reasons.
- LLM and keyword fallback implementations should share a narrow interface.

### `lib/analysis/`

Owns single-paper parsing and analysis.

- Batch analysis stays disabled until explicitly requested.
- Early testing should parse only one selected paper.
- Analysis output structure will be refined after the ingestion loop works.

### `lib/settings/`

Owns persisted non-secret settings.

- Research interest profile text can be persisted.
- arXiv categories and crawl time can be persisted.
- API keys must stay in environment variables or a server-only secret mechanism.

## Data Model Outline

Expected core entities:

- `papers`: normalized paper metadata.
- `crawl_runs`: each manual or scheduled crawl.
- `filter_profiles`: saved research-interest descriptions.
- `filter_results`: per-paper match result for a profile.
- `paper_states`: reading status, archive state, and favorite flag.
- `paper_analysis`: single-paper analysis results.
- `app_settings`: non-secret app settings.

## Security And Privacy

- API keys must never be exposed to client components.
- `.env` and local database files must not be committed.
- Runtime data is server-local unless the user later requests sync/export features.

## Current Status

The repository is at the documentation baseline. Application code has not been scaffolded yet.

