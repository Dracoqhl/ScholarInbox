import type { SqliteDatabase } from "@/lib/db/database";
import { createCrawlRepository } from "@/lib/crawls/repository";
import type { CrawlRun } from "@/lib/crawls/types";
import { createPaperRepository } from "@/lib/papers/repository";
import { fetchArxivPapers } from "@/lib/sources/arxiv";
import type { PaperSourceFetcher } from "@/lib/sources/types";

export async function crawlArxivDateRange(input: {
  db: SqliteDatabase;
  categories: string[];
  dateFrom: string;
  dateTo: string;
  fetchPapers?: PaperSourceFetcher;
}): Promise<CrawlRun> {
  const crawlRepository = createCrawlRepository(input.db);
  const paperRepository = createPaperRepository(input.db);
  const run = await crawlRepository.start({
    source: "arxiv",
    categories: input.categories,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo
  });

  try {
    const papers = await (input.fetchPapers ?? fetchArxivPapers)({
      categories: input.categories,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo
    });
    let insertedCount = 0;

    for (const paper of papers) {
      const result = await paperRepository.upsert(paper);
      if (result.inserted) insertedCount += 1;
    }

    return crawlRepository.finish(run.id, {
      status: "completed",
      fetchedCount: papers.length,
      insertedCount,
      duplicateCount: papers.length - insertedCount
    });
  } catch (error) {
    return crawlRepository.finish(run.id, {
      status: "failed",
      fetchedCount: 0,
      insertedCount: 0,
      duplicateCount: 0,
      errorMessage: error instanceof Error ? error.message : "Unknown crawl error"
    });
  }
}
