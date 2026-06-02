import type { SqliteDatabase } from "@/lib/db/database";
import { createCrawlRepository } from "@/lib/crawls/repository";
import type { CrawlRun } from "@/lib/crawls/types";
import { createPaperRepository } from "@/lib/papers/repository";
import { filterPapersByInterest, getInterestProfileHash } from "@/lib/filtering/interest-filter";
import type { InterestFilterResult } from "@/lib/filtering/types";
import { getResearchInterestProfile } from "@/lib/user-preferences/research-interest";
import { fetchArxivPapers } from "@/lib/sources/arxiv";
import type { PaperSourceFetcher } from "@/lib/sources/types";
import { analyzePapersWithLlm, type PaperAnalysisWithSourceId } from "@/lib/paper-analysis/llm-analysis";

export async function crawlArxivDateRange(input: {
  db: SqliteDatabase;
  categories: string[];
  dateFrom: string;
  dateTo: string;
  maxResults?: number;
  fetchPapers?: PaperSourceFetcher;
  filterPapers?: (papers: Awaited<ReturnType<PaperSourceFetcher>>, options: { interestProfile: string; profileHash: string }) => Promise<InterestFilterResult[]>;
  analyzePapers?: (papers: Awaited<ReturnType<PaperSourceFetcher>>) => Promise<PaperAnalysisWithSourceId[]>;
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
        dateTo: input.dateTo,
        maxResults: input.maxResults
      }
    });
    const papers = await (input.fetchPapers ?? fetchArxivPapers)({
      categories: input.categories,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      maxResults: input.maxResults
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
    const filter = await getFilterResults({
      papers,
      profileHash,
      interestProfile,
      paperRepository,
      filterPapers: input.filterPapers
    });
    const filterResults = filter.results;
    const matchedCount = filterResults.filter((result) => result.matched).length;
    await crawlRepository.appendLog(run.id, {
      level: "info",
      message: "Filtered papers by interest profile.",
      details: {
        checkedCount: filterResults.length,
        cachedFilterCount: filter.cachedCount,
        freshFilterCount: filter.freshCount,
        matchedCount,
        unmatchedCount: filterResults.length - matchedCount
      }
    });
    const filterResultsBySourceId = new Map(filterResults.map((result) => [result.sourceId, result]));
    let rawInsertedCount = 0;
    let effectiveInsertedCount = 0;
    const analysisCandidates: Array<{ paperId: string; paper: Awaited<ReturnType<PaperSourceFetcher>>[number] }> = [];

    for (const paper of papers) {
      const result = await paperRepository.upsert(paper);
      if (result.inserted) rawInsertedCount += 1;
      const filterResult = filterResultsBySourceId.get(paper.sourceId);
      if (filterResult) {
        const updatedPaper = await paperRepository.setFilterResult(result.paper.id, filterResult);
        if (result.inserted && filterResult.matched) effectiveInsertedCount += 1;
        if (filterResult.matched && !updatedPaper?.analysisSummaryZh) {
          analysisCandidates.push({ paperId: result.paper.id, paper });
        }
      }
    }
    await crawlRepository.appendLog(run.id, {
      level: "info",
      message: "Stored papers and filter results.",
      details: {
        rawInsertedCount,
        effectiveInsertedCount,
        storedUnmatchedCount: rawInsertedCount - effectiveInsertedCount,
        duplicateCount: filter.cachedCount
      }
    });
    if (analysisCandidates.length) {
      const analyses = await (input.analyzePapers ?? analyzePapersWithLlm)(analysisCandidates.map((candidate) => candidate.paper));
      const analysisBySourceId = new Map(analyses.map((analysis) => [analysis.sourceId, analysis]));
      let analyzedCount = 0;
      for (const candidate of analysisCandidates) {
        const analysis = analysisBySourceId.get(candidate.paper.sourceId);
        if (!analysis) continue;
        await paperRepository.setAnalysisResult(candidate.paperId, analysis);
        analyzedCount += 1;
      }
      if (analyzedCount > 0) {
        await crawlRepository.appendLog(run.id, {
          level: "info",
          message: "Generated Chinese paper analysis.",
          details: {
            analyzedCount,
            candidateCount: analysisCandidates.length
          }
        });
      }
    }
    await crawlRepository.appendLog(run.id, {
      level: "info",
      message: "Completed crawl.",
      details: {
        fetchedCount: papers.length,
        insertedCount: effectiveInsertedCount,
        duplicateCount: filter.cachedCount
      }
    });

    return crawlRepository.finish(run.id, {
      status: "completed",
      fetchedCount: papers.length,
      insertedCount: effectiveInsertedCount,
      duplicateCount: filter.cachedCount
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
}): Promise<{ results: InterestFilterResult[]; cachedCount: number; freshCount: number }> {
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

  return {
    results: [...cachedResults, ...freshResults],
    cachedCount: cachedResults.length,
    freshCount: uncachedPapers.length
  };
}
