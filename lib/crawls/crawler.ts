import type { SqliteDatabase } from "@/lib/db/database";
import { createCrawlRepository } from "@/lib/crawls/repository";
import type { CrawlLogEntry, CrawlRun } from "@/lib/crawls/types";
import { createPaperRepository } from "@/lib/papers/repository";
import { filterPapersByInterest, getInterestProfileHash } from "@/lib/filtering/interest-filter";
import type { InterestFilterResult } from "@/lib/filtering/types";
import { getResearchInterestProfile } from "@/lib/user-preferences/research-interest";
import { fetchArxivPapers } from "@/lib/sources/arxiv";
import type { PaperSourceFetcher } from "@/lib/sources/types";
import { analyzePapersWithLlm, type PaperAnalysisWithSourceId } from "@/lib/paper-analysis/llm-analysis";
import { generateAndStorePdfAnalysis } from "@/lib/pdf-analysis/service";
import type { Paper } from "@/lib/papers/types";

export async function crawlArxivDateRange(input: {
  db: SqliteDatabase;
  categories: string[];
  dateFrom: string;
  dateTo: string;
  maxResults?: number;
  fetchPapers?: PaperSourceFetcher;
  filterPapers?: (papers: Awaited<ReturnType<PaperSourceFetcher>>, options: { interestProfile: string; profileHash: string }) => Promise<InterestFilterResult[]>;
  analyzePapers?: (papers: Awaited<ReturnType<PaperSourceFetcher>>) => Promise<PaperAnalysisWithSourceId[]>;
  analyzePaperPdf?: (paper: Paper) => Promise<Paper>;
  onLog?: (log: CrawlLogEntry) => void | Promise<void>;
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
    const appendLog = async (entry: Omit<CrawlLogEntry, "at">) => {
      const nextRun = await crawlRepository.appendLog(run.id, entry);
      const nextLog = nextRun.logs[nextRun.logs.length - 1];
      if (nextLog) await input.onLog?.(nextLog);
    };

    await appendLog({
      level: "info",
      message: "Started manual arXiv crawl.",
      stage: "started",
      progress: { current: 0, total: 7, label: "初始化抓取任务" },
      details: {
        categories: input.categories,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        maxResults: input.maxResults
      }
    });
    await appendLog({
      level: "info",
      message: "Fetching papers from arXiv.",
      stage: "fetching",
      progress: { current: 1, total: 7, label: "请求 arXiv" }
    });
    const papers = await (input.fetchPapers ?? fetchArxivPapers)({
      categories: input.categories,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      maxResults: input.maxResults
    });
    await appendLog({
      level: "info",
      message: "Fetched papers from arXiv.",
      stage: "fetching",
      progress: { current: 2, total: 7, label: "完成 arXiv 抓取" },
      details: {
        count: papers.length
      }
    });
    const interestProfile = getResearchInterestProfile();
    const profileHash = getInterestProfileHash(interestProfile);
    await appendLog({
      level: "info",
      message: "Filtering papers by interest profile.",
      stage: "filtering",
      progress: { current: 3, total: 7, label: "AI 过滤候选论文" },
      details: {
        candidateCount: papers.length
      }
    });
    const filter = await getFilterResults({
      papers,
      profileHash,
      interestProfile,
      paperRepository,
      filterPapers: input.filterPapers
    });
    const filterResults = filter.results;
    const matchedCount = filterResults.filter((result) => result.matched).length;
    await appendLog({
      level: "info",
      message: "Filtered papers by interest profile.",
      stage: "filtering",
      progress: { current: 4, total: 7, label: "完成兴趣过滤" },
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
    const pdfAnalysisCandidates: Paper[] = [];

    await appendLog({
      level: "info",
      message: "Storing papers and filter results.",
      stage: "storing",
      progress: { current: 5, total: 7, label: "写入论文和过滤结果" },
      details: {
        paperCount: papers.length
      }
    });

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
        if (filterResult.matched && updatedPaper && !updatedPaper.pdfAnalysisOverviewZh) {
          pdfAnalysisCandidates.push(updatedPaper);
        }
      }
    }
    await appendLog({
      level: "info",
      message: "Stored papers and filter results.",
      stage: "storing",
      progress: { current: 5, total: 7, label: "完成入库" },
      details: {
        rawInsertedCount,
        effectiveInsertedCount,
        storedUnmatchedCount: rawInsertedCount - effectiveInsertedCount,
        duplicateCount: filter.cachedCount
      }
    });
    if (analysisCandidates.length) {
      await appendLog({
        level: "info",
        message: "Generating homepage Chinese analysis.",
        stage: "homepage_analysis",
        progress: { current: 0, total: analysisCandidates.length, label: "生成首页中文解析" },
        details: {
          candidateCount: analysisCandidates.length
        }
      });
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
        await appendLog({
          level: "info",
          message: "Generated Chinese paper analysis.",
          stage: "homepage_analysis",
          progress: { current: analyzedCount, total: analysisCandidates.length, label: "完成首页中文解析" },
          details: {
            analyzedCount,
            candidateCount: analysisCandidates.length
          }
        });
      }
    }
    if (pdfAnalysisCandidates.length) {
      const analyzePaperPdf = input.analyzePaperPdf ?? ((paper: Paper) => generateAndStorePdfAnalysis({ paperRepository, paper }));
      await appendLog({
        level: "info",
        message: "Generating PDF paper analysis.",
        stage: "pdf_analysis",
        progress: { current: 0, total: pdfAnalysisCandidates.length, label: "生成详情页 PDF 精读解析" },
        details: {
          candidateCount: pdfAnalysisCandidates.length
        }
      });
      let pdfAnalyzedCount = 0;
      for (const paper of pdfAnalysisCandidates) {
        await analyzePaperPdf(paper);
        pdfAnalyzedCount += 1;
        await appendLog({
          level: "info",
          message: "Analyzed PDF detail.",
          stage: "pdf_analysis",
          progress: { current: pdfAnalyzedCount, total: pdfAnalysisCandidates.length, label: `PDF 精读 ${pdfAnalyzedCount}/${pdfAnalysisCandidates.length}` },
          details: {
            current: pdfAnalyzedCount,
            total: pdfAnalysisCandidates.length,
            sourceId: paper.sourceId,
            title: paper.title
          }
        });
      }
      if (pdfAnalyzedCount > 0) {
        await appendLog({
          level: "info",
          message: "Generated PDF paper analysis.",
          stage: "pdf_analysis",
          progress: { current: pdfAnalyzedCount, total: pdfAnalysisCandidates.length, label: "完成详情页 PDF 精读解析" },
          details: {
            analyzedCount: pdfAnalyzedCount,
            candidateCount: pdfAnalysisCandidates.length
          }
        });
      }
    }
    await appendLog({
      level: "info",
      message: "Completed crawl.",
      stage: "completed",
      progress: { current: 7, total: 7, label: "抓取完成" },
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
    const failedRun = await crawlRepository.appendLog(run.id, {
      level: "error",
      message: "Crawl failed.",
      stage: "failed",
      details: {
        error: error instanceof Error ? error.message : "Unknown crawl error"
      }
    });
    const failedLog = failedRun.logs[failedRun.logs.length - 1];
    if (failedLog) await input.onLog?.(failedLog);
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
