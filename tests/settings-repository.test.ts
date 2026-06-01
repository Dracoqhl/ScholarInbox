import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDatabase } from "../lib/db/database";
import { ensureDatabaseSchema } from "../lib/db/schema";
import { createSettingsRepository } from "../lib/settings/repository";

describe("settings repository", () => {
  let dir: string;
  let databasePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scholar-inbox-settings-test-"));
    databasePath = join(dir, "test.sqlite");
    ensureDatabaseSchema(getDatabase(databasePath));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns default settings when none are saved", async () => {
    const settings = await createSettingsRepository(getDatabase(databasePath)).get();

    expect(settings.categories).toEqual(["cs.CL", "cs.AI", "cs.LG"]);
    expect(settings.dailyCrawlTime).toBe("08:00");
    expect(settings.interestProfile).toContain("大语言模型");
  });

  it("persists updated settings", async () => {
    const repository = createSettingsRepository(getDatabase(databasePath));

    await repository.update({
      categories: ["cs.CL"],
      dailyCrawlTime: "09:30",
      interestProfile: "只关注 agentic RL"
    });

    await expect(repository.get()).resolves.toEqual({
      categories: ["cs.CL"],
      dailyCrawlTime: "09:30",
      interestProfile: "只关注 agentic RL"
    });
  });
});
