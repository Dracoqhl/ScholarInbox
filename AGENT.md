# AGENT.md

This file stores maintainer context for future Codex sessions. It is project memory, not user-facing documentation.

## Project

- Product name: ScholarInbox.
- Repository: `git@github.com:Dracoqhl/ScholarInbox.git`.
- Stage: design baseline before implementation.
- Primary user: the repository owner, using the app on a personal server.
- Product positioning: self-hosted personal paper discovery, filtering, reading, and favorites.
- The app should not depend on GitHub Actions, GitHub Pages, or a GitHub-centered paper workflow.

## Confirmed Product Decisions

- Default technical stack: Next.js, TypeScript, SQLite, Drizzle ORM, arXiv API, cron-style scheduling, Docker-friendly deployment.
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
2. SQLite and Drizzle schema.
3. arXiv manual date-range crawl.
4. Paper storage and deduplication.
5. Basic paper list UI.
6. Favorite persistence and UI toggle.
7. Interest profile settings and filtering.
8. Daily scheduled crawl.
9. Single-paper analysis entry point.

