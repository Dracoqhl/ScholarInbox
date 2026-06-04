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
      analysis_summary_zh TEXT,
      analysis_problem_zh TEXT,
      analysis_method_zh TEXT,
      analysis_contribution_zh TEXT,
      analysis_detail_zh TEXT,
      analysis_model TEXT,
      analysis_checked_at TEXT,
      analysis_error TEXT,
      pdf_analysis_overview_zh TEXT,
      pdf_analysis_background_zh TEXT,
      pdf_analysis_problem_formulation_zh TEXT,
      pdf_analysis_method_zh TEXT,
      pdf_analysis_key_ideas_zh TEXT,
      pdf_analysis_experiments_zh TEXT,
      pdf_analysis_limitations_zh TEXT,
      pdf_analysis_reading_guide_zh TEXT,
      pdf_analysis_affiliations TEXT,
      pdf_analysis_model TEXT,
      pdf_analysis_checked_at TEXT,
      pdf_analysis_error TEXT,
      keyword_tags_json TEXT,
      created_at TEXT NOT NULL,
      updated_record_at TEXT NOT NULL,
      UNIQUE(source, source_id)
    );

    CREATE TABLE IF NOT EXISTS paper_states (
      paper_id TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('new', 'skipped', 'archived', 'irrelevant')),
      is_favorite INTEGER NOT NULL,
      user_note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS paper_user_tags (
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES user_tags(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (paper_id, tag_id)
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

    CREATE TABLE IF NOT EXISTS arxiv_paper_cache (
      source_id TEXT PRIMARY KEY,
      paper_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_papers_published_at ON papers(published_at);
    CREATE INDEX IF NOT EXISTS idx_papers_source_identity ON papers(source, source_id);
    CREATE INDEX IF NOT EXISTS idx_paper_states_favorite ON paper_states(is_favorite);
    CREATE INDEX IF NOT EXISTS idx_paper_states_status ON paper_states(status);
    CREATE INDEX IF NOT EXISTS idx_paper_user_tags_tag_id ON paper_user_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_crawl_runs_started_at ON crawl_runs(started_at);
  `);
  ensurePaperStateUserNoteColumn(db);
  ensurePaperStatesUseSimplifiedStatuses(db);
  ensureUserTagTables(db);
  ensurePaperFilterColumns(db);
  ensurePaperAnalysisColumns(db);
  ensurePaperPdfAnalysisColumns(db);
  ensurePaperKeywordTagColumns(db);
  ensureCrawlRunLogColumn(db);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_papers_filter_matched ON papers(filter_matched);
    CREATE INDEX IF NOT EXISTS idx_papers_filter_profile_hash ON papers(filter_profile_hash);
  `);
}

function ensurePaperStateUserNoteColumn(db: SqliteDatabase): void {
  const columns = new Set(db.prepare("PRAGMA table_info(paper_states);").all<{ name: string }>().map((column) => column.name));
  if (!columns.has("user_note")) {
    db.exec("ALTER TABLE paper_states ADD COLUMN user_note TEXT NOT NULL DEFAULT '';");
  }
}

function ensurePaperKeywordTagColumns(db: SqliteDatabase): void {
  const columns = new Set(db.prepare("PRAGMA table_info(papers);").all<{ name: string }>().map((column) => column.name));
  if (!columns.has("keyword_tags_json")) {
    db.exec("ALTER TABLE papers ADD COLUMN keyword_tags_json TEXT;");
  }
}

function ensurePaperPdfAnalysisColumns(db: SqliteDatabase): void {
  const columns = new Set(db.prepare("PRAGMA table_info(papers);").all<{ name: string }>().map((column) => column.name));
  const missingColumns = [
    ["pdf_analysis_overview_zh", "TEXT"],
    ["pdf_analysis_background_zh", "TEXT"],
    ["pdf_analysis_problem_formulation_zh", "TEXT"],
    ["pdf_analysis_method_zh", "TEXT"],
    ["pdf_analysis_key_ideas_zh", "TEXT"],
    ["pdf_analysis_experiments_zh", "TEXT"],
    ["pdf_analysis_limitations_zh", "TEXT"],
    ["pdf_analysis_reading_guide_zh", "TEXT"],
    ["pdf_analysis_affiliations", "TEXT"],
    ["pdf_analysis_model", "TEXT"],
    ["pdf_analysis_checked_at", "TEXT"],
    ["pdf_analysis_error", "TEXT"]
  ].filter(([name]) => !columns.has(name));

  for (const [name, type] of missingColumns) {
    db.exec(`ALTER TABLE papers ADD COLUMN ${name} ${type};`);
  }
}

function ensureCrawlRunLogColumn(db: SqliteDatabase): void {
  const columns = new Set(db.prepare("PRAGMA table_info(crawl_runs);").all<{ name: string }>().map((column) => column.name));
  if (!columns.has("log_json")) {
    db.exec("ALTER TABLE crawl_runs ADD COLUMN log_json TEXT;");
  }
}

function ensurePaperStatesUseSimplifiedStatuses(db: SqliteDatabase): void {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'paper_states'").get<{ sql: string }>();
  if (!table) return;
  const isSimplified = table.sql.includes("'skipped'") && !table.sql.includes("'general'");
  if (isSimplified) return;

  db.exec(`
    ALTER TABLE paper_states RENAME TO paper_states_old;
    CREATE TABLE paper_states (
      paper_id TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('new', 'skipped', 'archived', 'irrelevant')),
      is_favorite INTEGER NOT NULL,
      user_note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    INSERT INTO paper_states (paper_id, status, is_favorite, user_note, updated_at)
    SELECT paper_id,
           CASE WHEN status = 'new' THEN 'new'
                WHEN status = 'skipped' THEN 'skipped'
                WHEN status = 'irrelevant' THEN 'irrelevant'
                ELSE 'archived'
           END,
           is_favorite,
           COALESCE(user_note, ''),
           updated_at
    FROM paper_states_old;
    DROP TABLE paper_states_old;
  `);
}

function ensureUserTagTables(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS paper_user_tags (
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES user_tags(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (paper_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_paper_user_tags_tag_id ON paper_user_tags(tag_id);
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

function ensurePaperAnalysisColumns(db: SqliteDatabase): void {
  const columns = new Set(db.prepare("PRAGMA table_info(papers);").all<{ name: string }>().map((column) => column.name));
  const missingColumns = [
    ["analysis_summary_zh", "TEXT"],
    ["analysis_problem_zh", "TEXT"],
    ["analysis_method_zh", "TEXT"],
    ["analysis_contribution_zh", "TEXT"],
    ["analysis_detail_zh", "TEXT"],
    ["analysis_model", "TEXT"],
    ["analysis_checked_at", "TEXT"],
    ["analysis_error", "TEXT"]
  ].filter(([name]) => !columns.has(name));

  for (const [name, type] of missingColumns) {
    db.exec(`ALTER TABLE papers ADD COLUMN ${name} ${type};`);
  }
}
