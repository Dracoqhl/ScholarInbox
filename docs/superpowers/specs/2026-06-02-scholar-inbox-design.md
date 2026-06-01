# ScholarInbox Design

Date: 2026-06-02

## Goal

ScholarInbox is a self-hosted personal paper discovery and reading app. It tracks new papers relevant to the user's research interests, filters them by title and abstract, supports daily and date-range crawling, and provides a focused reading workspace with favorites for later review.

The product should not depend on GitHub Actions, GitHub Pages, or a GitHub-centered workflow. GitHub is used only for source control.

## Confirmed Stack

- Next.js full-stack app with TypeScript.
- SQLite for personal-server persistence.
- A small server-only SQLite wrapper around the system `sqlite3` command, matching `/data/proj/phd-workspace`.
- arXiv API as the first paper source.
- Cron-style background scheduling for daily crawls.
- Docker-friendly deployment.

## MVP Scope

The first implementation phase should establish the core ingestion and reading loop:

- Initialize the application skeleton and local development scripts.
- Create `README.md`, `architecture.md`, and `AGENT.md`.
- Define the SQLite schema for papers, crawl runs, settings, filter profiles, filter results, paper state, favorites, and single-paper analysis results.
- Implement manual arXiv date-range crawling.
- Deduplicate and store papers.
- Display stored papers in a basic web list.
- Include favorite state in the data model and UI from the start.

LLM-based interest filtering and single-paper analysis should follow after the crawl/store/list foundation works.

## Paper Sources

Initial source:

- arXiv.

Initial configurable categories:

- `cs.CL`
- `cs.AI`
- `cs.LG`

The source abstraction should avoid hard-coding arXiv assumptions into UI components. Future sources such as Semantic Scholar, OpenReview, or local PDFs should be possible without rewriting the paper list.

## Crawling

ScholarInbox needs two crawl modes:

- Daily scheduled crawl: fetch new papers for the current day according to server time.
- Manual batch crawl: fetch papers within a selected date range.

Each crawl run records:

- source
- categories
- date range
- start and finish timestamps
- status
- total fetched count
- inserted count
- skipped duplicate count
- error message, if any

The crawler must deduplicate by stable source identity, such as arXiv id. Re-running the same date range should not create duplicate papers.

## Interest Filtering

The app provides a settings text box where the user describes current research interests.

Example interest profile:

```text
大语言模型后训练、模型推理、test-time scaling、RLHF/DPO/RLAIF、agentic RL、tool use、multi-agent reasoning
```

Filtering requirements:

- Use only paper title and abstract.
- Decide whether the paper should be kept.
- Do not require or store a natural-language explanation for the decision.
- Store `matched` as the required result.
- Store an optional `score` if the filter implementation provides one.

The first LLM filter should be server-side and OpenAI-compatible. The implementation should keep a lightweight keyword fallback so crawling can still be tested when an LLM key is unavailable.

## Reading Workspace

Main views:

- `/dashboard`: recent matched papers and quick review workflow.
- `/papers`: full paper library with filters.
- `/papers/[id]`: detail view for a single paper.
- `/favorites`: papers marked for later review.
- `/crawls`: crawl history and manual date-range crawl controls.
- `/settings`: categories, crawl schedule, interest profile, and model settings.

Paper cards and rows should show:

- title
- abstract
- authors
- source categories
- published date
- updated date, when available
- arXiv link
- PDF link
- reading status
- favorite toggle

Reading statuses:

- `new`
- `interested`
- `reading`
- `done`
- `archived`

Favorite state is independent from reading status. A paper may be `done` and favorited, or `reading` and favorited.

## Single-Paper Analysis

During early testing, ScholarInbox should not batch-analyze papers.

Requirements:

- Add one detail-page action to parse/analyze a single paper.
- Keep batch parsing disabled by default.
- Complete parsing for only one selected paper during debugging.
- Store the analysis result for later display.

The exact analysis prompt and output structure will be refined after the ingestion and filtering loop works.

## Configuration

Configuration should support:

- arXiv categories
- daily crawl time
- interest profile text
- LLM base URL
- LLM model
- LLM API key
- testing mode for single-paper analysis

Sensitive values such as API keys must stay server-side and must not be exposed to frontend JavaScript or committed to Git. `.env.example` should document required variables without real values.

## Documentation Rules

The repository must maintain:

- `README.md`: Chinese user-facing documentation for purpose, setup, deployment, and privacy.
- `architecture.md`: project structure, module boundaries, data flow, and dependency rules.
- `AGENT.md`: private maintainer context for future Codex sessions, including product decisions, user preferences, collaboration rules, and Git sync policy.

Whenever setup, deployment, architecture, schema, feature scope, or collaboration rules change, update the relevant document in the same development round.

## Verification Strategy

Early verification should prioritize the ingestion loop:

- schema creation succeeds
- date-range arXiv crawl returns papers
- repeated crawl deduplicates papers
- stored papers render in the web list
- favorite toggle persists

Later verification should cover:

- interest filtering with mocked LLM responses
- keyword fallback behavior
- scheduled crawl execution
- single-paper analysis guardrails
- route-level API validation

## Initial Delivery Plan

1. Create the project skeleton and documentation baseline.
2. Add SQLite schema and the CLI-backed database wrapper.
3. Implement arXiv client and manual date-range crawl.
4. Store and list papers.
5. Add favorite persistence and UI toggle.
6. Add interest profile settings and filtering.
7. Add daily scheduled crawl.
8. Add single-paper analysis entry point.
