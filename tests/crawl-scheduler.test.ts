import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDailyCrawlSchedulerState, runDailyCrawlSchedulerTick } from "../lib/crawls/scheduler";
import { closeDatabase, getDatabase } from "../lib/db/database";
import { ensureDatabaseSchema } from "../lib/db/schema";
import { createSettingsRepository } from "../lib/settings/repository";

describe("daily crawl scheduler", () => {
  let dir: string;
  let databasePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scholar-inbox-scheduler-test-"));
    databasePath = join(dir, "test.sqlite");
    const db = getDatabase(databasePath);
    ensureDatabaseSchema(db);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
  });

  it("starts one scheduled crawl at the configured local time for the previous server-local date", async () => {
    const db = getDatabase(databasePath);
    await createSettingsRepository(db).update({
      categories: ["cs.CL", "cs.AI"],
      dailyCrawlTime: "06:00",
      interestProfile: "LLM reasoning"
    });
    const crawl = vi.fn().mockResolvedValue(undefined);
    const state = createDailyCrawlSchedulerState();

    await runDailyCrawlSchedulerTick({
      db,
      state,
      now: new Date(2026, 5, 3, 6, 0, 0),
      crawl
    });
    await runDailyCrawlSchedulerTick({
      db,
      state,
      now: new Date(2026, 5, 3, 6, 0, 30),
      crawl
    });

    expect(crawl).toHaveBeenCalledTimes(1);
    expect(crawl).toHaveBeenCalledWith(expect.objectContaining({
      db,
      categories: ["cs.CL", "cs.AI"],
      dateFrom: "2026-06-02",
      dateTo: "2026-06-02",
      trigger: "scheduled"
    }));
  });

  it("does not start a scheduled crawl outside the configured local minute", async () => {
    const db = getDatabase(databasePath);
    await createSettingsRepository(db).update({
      categories: ["cs.CL"],
      dailyCrawlTime: "06:00",
      interestProfile: "LLM reasoning"
    });
    const crawl = vi.fn().mockResolvedValue(undefined);

    await runDailyCrawlSchedulerTick({
      db,
      state: createDailyCrawlSchedulerState(),
      now: new Date(2026, 5, 3, 6, 1, 0),
      crawl
    });

    expect(crawl).not.toHaveBeenCalled();
  });
});
