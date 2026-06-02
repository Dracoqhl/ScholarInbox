import type { SqliteDatabase } from "@/lib/db/database";

export function ensureDatabaseSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      abstract TEXT NOT NULL,
      authors_json TEXT NOT NULL,
      categories_json TEXT NOT NULL,
      primary_category TEXT NOT NULL,
      published_at TEXT NOT NULL,
      updated_at TEXT,
      source_url TEXT NOT NULL,
      pdf_url TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_record_at TEXT NOT NULL,
      UNIQUE(source, source_id)
    );

    CREATE TABLE IF NOT EXISTS paper_states (
      paper_id TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('new', 'interested', 'reading', 'done', 'archived', 'irrelevant')),
      is_favorite INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS crawl_runs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      categories_json TEXT NOT NULL,
      date_from TEXT NOT NULL,
      date_to TEXT NOT NULL,
      status TEXT NOT NULL,
      fetched_count INTEGER NOT NULL,
      inserted_count INTEGER NOT NULL,
      duplicate_count INTEGER NOT NULL,
      error_message TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      log_json TEXT
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_papers_published_at ON papers(published_at);
    CREATE INDEX IF NOT EXISTS idx_papers_source_identity ON papers(source, source_id);
    CREATE INDEX IF NOT EXISTS idx_paper_states_favorite ON paper_states(is_favorite);
    CREATE INDEX IF NOT EXISTS idx_crawl_runs_started_at ON crawl_runs(started_at);
  `);
  ensurePaperStatesSupportsIrrelevant(db);
  ensurePaperFilterColumns(db);
  ensureCrawlRunLogColumn(db);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_papers_filter_matched ON papers(filter_matched);
    CREATE INDEX IF NOT EXISTS idx_papers_filter_profile_hash ON papers(filter_profile_hash);
  `);
}

function ensureCrawlRunLogColumn(db: SqliteDatabase): void {
  const columns = new Set(db.prepare("PRAGMA table_info(crawl_runs);").all<{ name: string }>().map((column) => column.name));
  if (!columns.has("log_json")) {
    db.exec("ALTER TABLE crawl_runs ADD COLUMN log_json TEXT;");
  }
}

function ensurePaperStatesSupportsIrrelevant(db: SqliteDatabase): void {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'paper_states'").get<{ sql: string }>();
  if (!table || table.sql.includes("'irrelevant'")) return;

  db.exec(`
    ALTER TABLE paper_states RENAME TO paper_states_old;
    CREATE TABLE paper_states (
      paper_id TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('new', 'interested', 'reading', 'done', 'archived', 'irrelevant')),
      is_favorite INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO paper_states (paper_id, status, is_favorite, updated_at)
    SELECT paper_id, status, is_favorite, updated_at FROM paper_states_old;
    DROP TABLE paper_states_old;
  `);
}

function ensurePaperFilterColumns(db: SqliteDatabase): void {
  const columns = new Set(db.prepare("PRAGMA table_info(papers);").all<{ name: string }>().map((column) => column.name));
  const missingColumns = [
    ["filter_matched", "INTEGER"],
    ["filter_score", "REAL"],
    ["filter_method", "TEXT"],
    ["filter_profile_hash", "TEXT"],
    ["filter_checked_at", "TEXT"],
    ["filter_error", "TEXT"]
  ].filter(([name]) => !columns.has(name));

  for (const [name, type] of missingColumns) {
    db.exec(`ALTER TABLE papers ADD COLUMN ${name} ${type};`);
  }
}
