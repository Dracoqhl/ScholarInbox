import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSchedulerState, getScheduledCrawlDateRange, runSchedulerTick, shouldRunScheduledCrawl } from "../scripts/daily-crawl-scheduler.mjs";

describe("daily crawl scheduler script", () => {
  let dir;
  let databasePath;
  let originalFetch;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scholar-inbox-script-scheduler-test-"));
    databasePath = join(dir, "test.sqlite");
    execFileSync("sqlite3", [databasePath, `
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE crawl_runs (
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
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('dailyCrawlTime', '06:00', '2026-06-03T00:00:00.000Z');
    `]);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses the previous server-local date as the scheduled crawl range", () => {
    expect(getScheduledCrawlDateRange(new Date(2026, 5, 3, 6, 0, 0))).toEqual({
      dateFrom: "2026-06-02",
      dateTo: "2026-06-02"
    });
    expect(shouldRunScheduledCrawl(new Date(2026, 5, 3, 6, 0, 0), "06:00")).toBe(true);
    expect(shouldRunScheduledCrawl(new Date(2026, 5, 3, 6, 1, 0), "06:00")).toBe(false);
  });

  it("posts one scheduled crawl request at the configured local minute", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const state = createSchedulerState();

    await runSchedulerTick({
      state,
      databasePath,
      baseUrl: "http://127.0.0.1:3120",
      now: new Date(2026, 5, 3, 6, 0, 0)
    });
    await runSchedulerTick({
      state,
      databasePath,
      baseUrl: "http://127.0.0.1:3120",
      now: new Date(2026, 5, 3, 6, 0, 30)
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3120/api/crawls/manual",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          dateFrom: "2026-06-02",
          dateTo: "2026-06-02",
          trigger: "scheduled"
        })
      })
    );
  });
});
