import type { SqliteDatabase } from "@/lib/db/database";
import { createCrawlRepository } from "@/lib/crawls/repository";
import type { CrawlRun } from "@/lib/crawls/types";
import { createPaperRepository } from "@/lib/papers/repository";
import { filterPapersByInterest, getInterestProfileHash } from "@/lib/filtering/interest-filter";
import type { InterestFilterResult } from "@/lib/filtering/types";
import { getResearchInterestProfile } from "@/lib/user-preferences/research-interest";
import { fetchArxivPapers } from "@/lib/sources/arxiv";
import type { PaperSourceFetcher } from "@/lib/sources/types";

export async function crawlArxivDateRange(input: {
  db: SqliteDatabase;
  categories: string[];
  dateFrom: string;
  dateTo: string;
  fetchPapers?: PaperSourceFetcher;
  filterPapers?: (papers: Awaited<ReturnType<PaperSourceFetcher>>, options: { interestProfile: string; profileHash: string }) => Promise<InterestFilterResult[]>;
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
    await crawlRepository.appendLog(run.id, {
      level: "info",
      message: "Started manual arXiv crawl.",
      details: {
        categories: input.categories,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo
      }
    });
    const papers = await (input.fetchPapers ?? fetchArxivPapers)({
      categories: input.categories,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo
    });
    await crawlRepository.appendLog(run.id, {
      level: "info",
      message: "Fetched papers from arXiv.",
      details: {
        count: papers.length
      }
    });
    const interestProfile = getResearchInterestProfile();
    const profileHash = getInterestProfileHash(interestProfile);
    const filterResults = await getFilterResults({
      papers,
      profileHash,
      interestProfile,
      paperRepository,
      filterPapers: input.filterPapers
    });
    const matchedCount = filterResults.filter((result) => result.matched).length;
    await crawlRepository.appendLog(run.id, {
      level: "info",
      message: "Filtered papers by interest profile.",
      details: {
        checkedCount: filterResults.length,
        matchedCount,
        unmatchedCount: filterResults.length - matchedCount
      }
    });
    const filterResultsBySourceId = new Map(filterResults.map((result) => [result.sourceId, result]));
    let insertedCount = 0;

    for (const paper of papers) {
      const result = await paperRepository.upsert(paper);
      if (result.inserted) insertedCount += 1;
      const filterResult = filterResultsBySourceId.get(paper.sourceId);
      if (filterResult) {
        await paperRepository.setFilterResult(result.paper.id, filterResult);
      }
    }
    await crawlRepository.appendLog(run.id, {
      level: "info",
      message: "Stored papers and filter results.",
      details: {
        insertedCount,
        duplicateCount: papers.length - insertedCount
      }
    });
    await crawlRepository.appendLog(run.id, {
      level: "info",
      message: "Completed crawl.",
      details: {
        fetchedCount: papers.length,
        insertedCount,
        duplicateCount: papers.length - insertedCount
      }
    });

    return crawlRepository.finish(run.id, {
      status: "completed",
      fetchedCount: papers.length,
      insertedCount,
      duplicateCount: papers.length - insertedCount
    });
  } catch (error) {
    await crawlRepository.appendLog(run.id, {
      level: "error",
      message: "Crawl failed.",
      details: {
        error: error instanceof Error ? error.message : "Unknown crawl error"
      }
    });
    return crawlRepository.finish(run.id, {
      status: "failed",
      fetchedCount: 0,
      insertedCount: 0,
      duplicateCount: 0,
      errorMessage: error instanceof Error ? error.message : "Unknown crawl error"
    });
  }
}

async function getFilterResults(input: {
  papers: Awaited<ReturnType<PaperSourceFetcher>>;
  profileHash: string;
  interestProfile: string;
  paperRepository: ReturnType<typeof createPaperRepository>;
  filterPapers?: (papers: Awaited<ReturnType<PaperSourceFetcher>>, options: { interestProfile: string; profileHash: string }) => Promise<InterestFilterResult[]>;
}): Promise<InterestFilterResult[]> {
  const cachedResults: InterestFilterResult[] = [];
  const uncachedPapers: Awaited<ReturnType<PaperSourceFetcher>> = [];

  for (const paper of input.papers) {
    const cached = await input.paperRepository.getCurrentFilterResult(paper.source, paper.sourceId, input.profileHash);
    if (cached) {
      cachedResults.push({ sourceId: paper.sourceId, ...cached });
    } else {
      uncachedPapers.push(paper);
    }
  }

  const freshResults = uncachedPapers.length
    ? await (input.filterPapers ?? ((papers) => filterPapersByInterest(papers, { interestProfile: input.interestProfile })))(uncachedPapers, {
      interestProfile: input.interestProfile,
      profileHash: input.profileHash
    })
    : [];

  return [...cachedResults, ...freshResults];
}
