import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDatabase } from "../lib/db/database";
import { ensureDatabaseSchema } from "../lib/db/schema";
import { crawlArxivDateRange } from "../lib/crawls/crawler";
import { createCrawlRepository } from "../lib/crawls/repository";
import { createPaperRepository } from "../lib/papers/repository";
import type { PaperInput } from "../lib/papers/types";

describe("crawl service", () => {
  let dir: string;
  let databasePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scholar-inbox-crawl-test-"));
    databasePath = join(dir, "test.sqlite");
    ensureDatabaseSchema(getDatabase(databasePath));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("stores fetched papers and records crawl counts", async () => {
    const db = getDatabase(databasePath);

    const result = await crawlArxivDateRange({
      db,
      categories: ["cs.CL"],
      dateFrom: "2024-01-01",
      dateTo: "2024-01-02",
      fetchPapers: async () => [makePaperInput("2401.00001"), makePaperInput("2401.00002")],
      filterPapers: async (papers) => papers.map((paper) => ({
        sourceId: paper.sourceId,
        matched: true,
        score: 0.9,
        method: "llm",
        profileHash: "test-profile",
        checkedAt: "2026-06-02T00:00:00.000Z",
        error: null
      }))
    });

    const papers = await createPaperRepository(db).list({});
    const runs = await createCrawlRepository(db).list();

    expect(result).toMatchObject({
      fetchedCount: 2,
      insertedCount: 2,
      duplicateCount: 0,
      status: "completed"
    });
    expect(papers).toHaveLength(2);
    expect(runs[0]).toMatchObject({
      source: "arxiv",
      status: "completed",
      fetchedCount: 2,
      insertedCount: 2,
      duplicateCount: 0
    });
  });

  it("counts duplicates when the same range is crawled twice", async () => {
    const db = getDatabase(databasePath);
    const fetchPapers = async () => [makePaperInput("2401.00003")];
    const filterPapers = async (papers: PaperInput[]) => papers.map((paper) => ({
      sourceId: paper.sourceId,
      matched: true,
      score: 0.9,
      method: "llm" as const,
      profileHash: "test-profile",
      checkedAt: "2026-06-02T00:00:00.000Z",
      error: null
    }));

    await crawlArxivDateRange({ db, categories: ["cs.CL"], dateFrom: "2024-01-01", dateTo: "2024-01-01", fetchPapers, filterPapers });
    const second = await crawlArxivDateRange({ db, categories: ["cs.CL"], dateFrom: "2024-01-01", dateTo: "2024-01-01", fetchPapers, filterPapers });

    expect(second.insertedCount).toBe(0);
    expect(second.duplicateCount).toBe(1);
  });

  it("stores unmatched papers but hides them from the default paper list", async () => {
    const db = getDatabase(databasePath);

    await crawlArxivDateRange({
      db,
      categories: ["cs.CL"],
      dateFrom: "2024-01-01",
      dateTo: "2024-01-01",
      fetchPapers: async () => [makePaperInput("2401.00004"), makePaperInput("2401.00005")],
      filterPapers: async (papers) => papers.map((paper) => ({
        sourceId: paper.sourceId,
        matched: paper.sourceId === "2401.00004",
        score: paper.sourceId === "2401.00004" ? 0.88 : 0.12,
        method: "llm",
        profileHash: "test-profile",
        checkedAt: "2026-06-02T00:00:00.000Z",
        error: null
      }))
    });

    const repository = createPaperRepository(db);

    expect(await repository.list({})).toHaveLength(2);
    expect((await repository.list({ matched: true })).map((paper) => paper.sourceId)).toEqual(["2401.00004"]);
  });
});

function makePaperInput(sourceId: string): PaperInput {
  return {
    source: "arxiv",
    sourceId,
    title: `Paper ${sourceId}`,
    abstract: "A paper about language model post-training.",
    authors: ["Ada Lovelace"],
    categories: ["cs.CL"],
    primaryCategory: "cs.CL",
    publishedAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    sourceUrl: `https://arxiv.org/abs/${sourceId}`,
    pdfUrl: `https://arxiv.org/pdf/${sourceId}`
  };
}
