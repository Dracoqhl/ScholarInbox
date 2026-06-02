import { randomUUID } from "node:crypto";

import type { SqliteDatabase } from "@/lib/db/database";
import type { CrawlLogEntry, CrawlRun, CrawlRunRow, CrawlStatus } from "@/lib/crawls/types";

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
      finishedAt: null,
      logs: []
    };
    this.db
      .prepare(
        `INSERT INTO crawl_runs
         (id, source, categories_json, date_from, date_to, status, fetched_count, inserted_count,
          duplicate_count, error_message, started_at, finished_at, log_json)
         VALUES
         (@id, @source, @categoriesJson, @dateFrom, @dateTo, @status, @fetchedCount, @insertedCount,
          @duplicateCount, @errorMessage, @startedAt, @finishedAt, @logJson)`
      )
      .run(toRunParams(run));
    return run;
  }

  async appendLog(id: string, entry: Omit<CrawlLogEntry, "at"> & { at?: string }): Promise<CrawlRun> {
    const run = await this.get(id);
    if (!run) throw new Error(`Crawl run not found: ${id}`);
    const nextEntry: CrawlLogEntry = {
      at: entry.at ?? new Date().toISOString(),
      level: entry.level,
      message: entry.message,
      ...(entry.stage ? { stage: entry.stage } : {}),
      ...(entry.progress ? { progress: entry.progress } : {}),
      ...(entry.details ? { details: entry.details } : {})
    };
    const logs = [...run.logs, nextEntry];
    this.db
      .prepare("UPDATE crawl_runs SET log_json = @logJson WHERE id = @id")
      .run({ id, logJson: JSON.stringify(logs) });
    return { ...run, logs };
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
    finishedAt: run.finishedAt,
    logJson: JSON.stringify(run.logs)
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
    finishedAt: row.finished_at,
    logs: parseLogs(row.log_json)
  };
}

function parseLogs(value: string | null | undefined): CrawlLogEntry[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCrawlLogEntry);
  } catch {
    return [];
  }
}

function isCrawlLogEntry(value: unknown): value is CrawlLogEntry {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.at === "string" &&
    (record.level === "info" || record.level === "error") &&
    typeof record.message === "string" &&
    (record.stage === undefined || typeof record.stage === "string") &&
    (record.progress === undefined || isCrawlLogProgress(record.progress)) &&
    (record.details === undefined || (record.details !== null && typeof record.details === "object" && !Array.isArray(record.details)))
  );
}

function isCrawlLogProgress(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.current === "number" &&
    typeof record.total === "number" &&
    (record.label === undefined || typeof record.label === "string")
  );
}
