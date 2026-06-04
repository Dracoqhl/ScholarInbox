import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createArxivCacheRepository } from "../lib/sources/arxiv-cache";
import { getDatabase } from "../lib/db/database";
import { ensureDatabaseSchema } from "../lib/db/schema";
import type { PaperInput } from "../lib/papers/types";

describe("arXiv cache repository", () => {
  let dir: string;
  let databasePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scholar-inbox-arxiv-cache-test-"));
    databasePath = join(dir, "test.sqlite");
    ensureDatabaseSchema(getDatabase(databasePath));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("stores and retrieves arXiv paper metadata by source id", async () => {
    const repository = createArxivCacheRepository(getDatabase(databasePath));

    await repository.setPaper(makePaperInput("2606.00010"));

    await expect(repository.getPaper("2606.00010")).resolves.toMatchObject({
      sourceId: "2606.00010",
      title: "Cached 2606.00010"
    });
  });
});

function makePaperInput(sourceId: string): PaperInput {
  return {
    source: "arxiv",
    sourceId,
    title: `Cached ${sourceId}`,
    abstract: "Cached metadata.",
    authors: ["Ada Lovelace"],
    categories: ["cs.CL"],
    primaryCategory: "cs.CL",
    publishedAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
    sourceUrl: `https://arxiv.org/abs/${sourceId}`,
    pdfUrl: `https://arxiv.org/pdf/${sourceId}`
  };
}
