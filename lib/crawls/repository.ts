import { randomUUID } from "node:crypto";

import type { SqliteDatabase } from "@/lib/db/database";
import type { CrawlRun, CrawlRunRow, CrawlStatus } from "@/lib/crawls/types";

export function createCrawlRepository(db: SqliteDatabase) {
  return new CrawlRepository(db);
}

class CrawlRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async start(input: { source: string; categories: string[]; dateFrom: string; dateTo: string }): Promise<CrawlRun> {
    const run: CrawlRun = {
      id: randomUUID(),
      source: input.source,
      categories: input.categories,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      status: "running",
      fetchedCount: 0,
      insertedCount: 0,
      duplicateCount: 0,
      errorMessage: null,
      startedAt: new Date().toISOString(),
      finishedAt: null
    };
    this.db
      .prepare(
        `INSERT INTO crawl_runs
         (id, source, categories_json, date_from, date_to, status, fetched_count, inserted_count,
          duplicate_count, error_message, started_at, finished_at)
         VALUES
         (@id, @source, @categoriesJson, @dateFrom, @dateTo, @status, @fetchedCount, @insertedCount,
          @duplicateCount, @errorMessage, @startedAt, @finishedAt)`
      )
      .run(toRunParams(run));
    return run;
  }

  async finish(
    id: string,
    result: { status: Exclude<CrawlStatus, "running">; fetchedCount: number; insertedCount: number; duplicateCount: number; errorMessage?: string | null }
  ): Promise<CrawlRun> {
    this.db
      .prepare(
        `UPDATE crawl_runs
         SET status = @status,
             fetched_count = @fetchedCount,
             inserted_count = @insertedCount,
             duplicate_count = @duplicateCount,
             error_message = @errorMessage,
             finished_at = @finishedAt
         WHERE id = @id`
      )
      .run({
        id,
        status: result.status,
        fetchedCount: result.fetchedCount,
        insertedCount: result.insertedCount,
        duplicateCount: result.duplicateCount,
        errorMessage: result.errorMessage ?? null,
        finishedAt: new Date().toISOString()
      });
    return (await this.get(id)) as CrawlRun;
  }

  async get(id: string): Promise<CrawlRun | null> {
    const row = this.db.prepare("SELECT * FROM crawl_runs WHERE id = @id").get<CrawlRunRow>({ id });
    return row ? mapRun(row) : null;
  }

  async list(): Promise<CrawlRun[]> {
    return this.db
      .prepare("SELECT * FROM crawl_runs ORDER BY started_at DESC")
      .all<CrawlRunRow>()
      .map(mapRun);
  }
}

function toRunParams(run: CrawlRun) {
  return {
    id: run.id,
    source: run.source,
    categoriesJson: JSON.stringify(run.categories),
    dateFrom: run.dateFrom,
    dateTo: run.dateTo,
    status: run.status,
    fetchedCount: run.fetchedCount,
    insertedCount: run.insertedCount,
    duplicateCount: run.duplicateCount,
    errorMessage: run.errorMessage,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt
  };
}

function mapRun(row: CrawlRunRow): CrawlRun {
  return {
    id: row.id,
    source: row.source,
    categories: JSON.parse(row.categories_json) as string[],
    dateFrom: row.date_from,
    dateTo: row.date_to,
    status: row.status,
    fetchedCount: row.fetched_count,
    insertedCount: row.inserted_count,
    duplicateCount: row.duplicate_count,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    finishedAt: row.finished_at
  };
}
