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
      })),
      analyzePapers: async () => []
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

  it("records crawl logs for debugging", async () => {
    const db = getDatabase(databasePath);

    const result = await crawlArxivDateRange({
      db,
      categories: ["cs.CL"],
      dateFrom: "2024-01-01",
      dateTo: "2024-01-01",
      fetchPapers: async () => [makePaperInput("2401.00006")],
      filterPapers: async (papers) => papers.map((paper) => ({
        sourceId: paper.sourceId,
        matched: true,
        score: 0.91,
        method: "llm",
        profileHash: "test-profile",
        checkedAt: "2026-06-02T00:00:00.000Z",
        error: null
      })),
      analyzePapers: async () => []
    });
    const [storedRun] = await createCrawlRepository(db).list();

    expect(result.logs.map((log) => log.level)).toEqual(["info", "info", "info", "info", "info"]);
    expect(result.logs.map((log) => log.message)).toEqual([
      "Started manual arXiv crawl.",
      "Fetched papers from arXiv.",
      "Filtered papers by interest profile.",
      "Stored papers and filter results.",
      "Completed crawl."
    ]);
    expect(result.logs[0]).toMatchObject({
      details: {
        categories: ["cs.CL"],
        dateFrom: "2024-01-01",
        dateTo: "2024-01-01"
      }
    });
    expect(storedRun.logs).toEqual(result.logs);
  });

  it("counts duplicates when the same range is crawled twice", async () => {
    const db = getDatabase(databasePath);
    const fetchPapers = async () => [makePaperInput("2401.00003")];
    let filterCallCount = 0;
    const filterPapers = async (papers: PaperInput[], options: { profileHash: string }) => papers.map((paper) => ({
      sourceId: paper.sourceId,
      matched: true,
      score: 0.9,
      method: "llm" as const,
      profileHash: options.profileHash,
      checkedAt: "2026-06-02T00:00:00.000Z",
      error: null
    }));
    const countingFilterPapers = async (papers: PaperInput[], options: { profileHash: string }) => {
      filterCallCount += 1;
      return filterPapers(papers, options);
    };

    await crawlArxivDateRange({ db, categories: ["cs.CL"], dateFrom: "2024-01-01", dateTo: "2024-01-01", fetchPapers, filterPapers: countingFilterPapers, analyzePapers: async () => [] });
    const second = await crawlArxivDateRange({ db, categories: ["cs.CL"], dateFrom: "2024-01-01", dateTo: "2024-01-01", fetchPapers, filterPapers: countingFilterPapers, analyzePapers: async () => [] });

    expect(filterCallCount).toBe(1);
    expect(second.insertedCount).toBe(0);
    expect(second.duplicateCount).toBe(1);
    expect(second.logs.find((log) => log.message === "Filtered papers by interest profile.")?.details).toMatchObject({
      cachedFilterCount: 1,
      freshFilterCount: 0
    });
  });

  it("counts only newly matched papers as inserted", async () => {
    const db = getDatabase(databasePath);

    const result = await crawlArxivDateRange({
      db,
      categories: ["cs.CL"],
      dateFrom: "2024-01-01",
      dateTo: "2024-01-01",
      fetchPapers: async () => [makePaperInput("2401.00007"), makePaperInput("2401.00008")],
      filterPapers: async (papers) => papers.map((paper) => ({
        sourceId: paper.sourceId,
        matched: paper.sourceId === "2401.00007",
        score: paper.sourceId === "2401.00007" ? 0.9 : 0.2,
        method: "llm" as const,
        profileHash: "test-profile",
        checkedAt: "2026-06-02T00:00:00.000Z",
        error: null
      })),
      analyzePapers: async () => []
    });

    expect(result.fetchedCount).toBe(2);
    expect(result.insertedCount).toBe(1);
    expect(result.duplicateCount).toBe(0);
    expect(result.logs.find((log) => log.message === "Stored papers and filter results.")?.details).toMatchObject({
      rawInsertedCount: 2,
      effectiveInsertedCount: 1,
      storedUnmatchedCount: 1
    });
  });

  it("analyzes every matched paper that does not already have Chinese analysis", async () => {
    const db = getDatabase(databasePath);
    const analyzedSourceIds: string[] = [];

    await crawlArxivDateRange({
      db,
      categories: ["cs.CL"],
      dateFrom: "2024-01-01",
      dateTo: "2024-01-01",
      fetchPapers: async () => [makePaperInput("2401.00009"), makePaperInput("2401.00010"), makePaperInput("2401.00011")],
      filterPapers: async (papers) => papers.map((paper) => ({
        sourceId: paper.sourceId,
        matched: paper.sourceId !== "2401.00011",
        score: paper.sourceId !== "2401.00011" ? 0.9 : 0.2,
        method: "llm",
        profileHash: "test-profile",
        checkedAt: "2026-06-02T00:00:00.000Z",
        error: null
      })),
      analyzePapers: async (papers) => {
        analyzedSourceIds.push(...papers.map((paper) => paper.sourceId));
        return papers.map((paper) => ({
          sourceId: paper.sourceId,
          summaryZh: `中文概括 ${paper.sourceId}`,
          problemZh: "它要解决复杂推理任务中的训练信号不足问题。",
          methodZh: "它通过构造轨迹奖励来改进语言模型推理。",
          contributionZh: "主要贡献是把过程监督和结果奖励结合起来。",
          detailZh: "这篇论文的完整解析会解释问题背景、方法流程、实验结论和局限。",
          model: "test-analysis-model",
          checkedAt: "2026-06-02T00:00:00.000Z",
          error: null
        }));
      }
    });

    const papers = await createPaperRepository(db).list({});
    const analyzed = papers.filter((paper) => paper.analysisSummaryZh);

    expect(analyzedSourceIds).toEqual(["2401.00009", "2401.00010"]);
    expect(analyzed).toHaveLength(2);
    expect(analyzed.map((paper) => paper.sourceId)).toEqual(["2401.00010", "2401.00009"]);
    expect(analyzed[0]).toMatchObject({
      analysisModel: "test-analysis-model"
    });
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
      })),
      analyzePapers: async () => []
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
