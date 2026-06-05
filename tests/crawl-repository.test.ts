import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCrawlRepository } from "../lib/crawls/repository";
import { getDatabase } from "../lib/db/database";
import { ensureDatabaseSchema } from "../lib/db/schema";

describe("crawl repository", () => {
  let dir: string;
  let databasePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scholar-inbox-crawl-repository-test-"));
    databasePath = join(dir, "test.sqlite");
    ensureDatabaseSchema(getDatabase(databasePath));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("marks stale running crawl runs as failed", async () => {
    const db = getDatabase(databasePath);
    const repository = createCrawlRepository(db);
    const run = await repository.start({
      source: "arxiv",
      categories: ["cs.CL"],
      dateFrom: "2026-06-02",
      dateTo: "2026-06-03"
    });
    db
      .prepare("UPDATE crawl_runs SET started_at = @startedAt WHERE id = @id")
      .run({ id: run.id, startedAt: "2026-06-03T10:00:00.000Z" });

    await repository.failStaleRunningRuns({
      olderThanMs: 60_000,
      now: () => new Date("2026-06-03T10:02:00.000Z")
    });

    expect(await repository.get(run.id)).toMatchObject({
      status: "failed",
      errorMessage: "Crawl run became stale before finishing."
    });
    expect((await repository.get(run.id))?.logs.at(-1)).toMatchObject({
      level: "error",
      stage: "failed",
      message: "Crawl run became stale before finishing."
    });
  });

  it("can list only the latest crawl run for log restoration", async () => {
    const db = getDatabase(databasePath);
    const repository = createCrawlRepository(db);
    const older = await repository.start({
      source: "arxiv",
      categories: ["cs.CL"],
      dateFrom: "2026-06-02",
      dateTo: "2026-06-02"
    });
    const newer = await repository.start({
      source: "arxiv",
      categories: ["cs.CL"],
      dateFrom: "2026-06-03",
      dateTo: "2026-06-03"
    });
    db.prepare("UPDATE crawl_runs SET started_at = @startedAt WHERE id = @id").run({ id: older.id, startedAt: "2026-06-02T00:00:00.000Z" });
    db.prepare("UPDATE crawl_runs SET started_at = @startedAt WHERE id = @id").run({ id: newer.id, startedAt: "2026-06-03T00:00:00.000Z" });

    const runs = await repository.list({ limit: 1 });

    expect(runs.map((run) => run.id)).toEqual([newer.id]);
  });
});
