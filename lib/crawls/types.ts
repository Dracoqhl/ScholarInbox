export type CrawlStatus = "running" | "completed" | "failed";

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
};
