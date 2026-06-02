export type CrawlStatus = "running" | "completed" | "failed";

export type CrawlLogLevel = "info" | "error";
export type CrawlLogStage = "submitted" | "started" | "fetching" | "filtering" | "storing" | "homepage_analysis" | "pdf_analysis" | "completed" | "failed";

export type CrawlLogProgress = {
  current: number;
  total: number;
  label?: string;
};

export type CrawlLogEntry = {
  at: string;
  level: CrawlLogLevel;
  message: string;
  stage?: CrawlLogStage;
  progress?: CrawlLogProgress;
  details?: Record<string, unknown>;
};

export type CrawlRun = {
  id: string;
  source: string;
  categories: string[];
  dateFrom: string;
  dateTo: string;
  status: CrawlStatus;
  fetchedCount: number;
  insertedCount: number;
  duplicateCount: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  logs: CrawlLogEntry[];
};

export type CrawlRunRow = {
  id: string;
  source: string;
  categories_json: string;
  date_from: string;
  date_to: string;
  status: CrawlStatus;
  fetched_count: number;
  inserted_count: number;
  duplicate_count: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  log_json?: string | null;
};
