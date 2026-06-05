import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDatabase } from "../lib/db/database";

describe("sqlite database wrapper", () => {
  let dir: string;
  let databasePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scholar-inbox-database-test-"));
    databasePath = join(dir, "test.sqlite");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads query results larger than node's default child-process buffer", () => {
    const db = getDatabase(databasePath);
    db.exec(`
      CREATE TABLE large_rows (value TEXT NOT NULL);
      WITH RECURSIVE rows(index_value) AS (
        VALUES(1)
        UNION ALL
        SELECT index_value + 1 FROM rows WHERE index_value < 8
      )
      INSERT INTO large_rows (value)
      SELECT hex(randomblob(90000)) FROM rows;
    `);

    const rows = db.prepare("SELECT value FROM large_rows").all<{ value: string }>();

    expect(rows).toHaveLength(8);
    expect(rows[0].value.length).toBe(180000);
  });
});
