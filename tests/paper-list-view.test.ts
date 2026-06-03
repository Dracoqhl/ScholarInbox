import { describe, expect, it } from "vitest";

import { groupPapersByPublishedDate, shouldKeepPaperAfterLocalMutation, sortPapersForList } from "../lib/papers/list-view";
import type { Paper } from "../lib/papers/types";

describe("paper list view sorting", () => {
  it("sorts by recent date first and score within each date by default", () => {
    const papers = [
      makePaper("old-high", "2026-06-01T10:00:00.000Z", 0.99),
      makePaper("new-low", "2026-06-02T08:00:00.000Z", 0.71),
      makePaper("new-high", "2026-06-02T07:00:00.000Z", 0.95)
    ];

    expect(sortPapersForList(papers, "date").map((paper) => paper.sourceId)).toEqual(["new-high", "new-low", "old-high"]);
  });

  it("sorts globally by score when requested", () => {
    const papers = [
      makePaper("new-low", "2026-06-02T08:00:00.000Z", 0.71),
      makePaper("old-high", "2026-06-01T10:00:00.000Z", 0.99)
    ];

    expect(sortPapersForList(papers, "score").map((paper) => paper.sourceId)).toEqual(["old-high", "new-low"]);
  });

  it("groups sorted papers by published date", () => {
    const sorted = sortPapersForList([
      makePaper("old", "2026-06-01T10:00:00.000Z", 0.99),
      makePaper("new", "2026-06-02T08:00:00.000Z", 0.71)
    ], "date");

    expect(groupPapersByPublishedDate(sorted).map((group) => ({ date: group.date, count: group.papers.length }))).toEqual([
      { date: "2026-06-02", count: 1 },
      { date: "2026-06-01", count: 1 }
    ]);
  });

  it("keeps a locally archived paper visible in the inbox until the next reload", () => {
    const paper = makePaper("newly-archived", "2026-06-02T08:00:00.000Z", 0.91, { status: "archived" });

    expect(
      shouldKeepPaperAfterLocalMutation(paper, {
        mode: "inbox",
        status: "new",
        selectedUserTagIds: [],
        keywordTags: [],
        publishedFrom: "",
        publishedTo: ""
      })
    ).toBe(true);
  });

  it("still applies active filters outside the inbox after local mutations", () => {
    const paper = makePaper("irrelevant", "2026-06-02T08:00:00.000Z", 0.91, { status: "irrelevant" });

    expect(
      shouldKeepPaperAfterLocalMutation(paper, {
        mode: "archive",
        status: "archived",
        selectedUserTagIds: [],
        keywordTags: [],
        publishedFrom: "",
        publishedTo: ""
      })
    ).toBe(false);
  });
});

function makePaper(sourceId: string, publishedAt: string, filterScore: number, overrides: Partial<Paper> = {}): Paper {
  return {
    id: sourceId,
    source: "arxiv",
    sourceId,
    title: sourceId,
    abstract: "abstract",
    authors: [],
    categories: ["cs.CL"],
    primaryCategory: "cs.CL",
    publishedAt,
    updatedAt: publishedAt,
    sourceUrl: `https://arxiv.org/abs/${sourceId}`,
    pdfUrl: `https://arxiv.org/pdf/${sourceId}`,
    status: "new",
    isFavorite: false,
    filterMatched: true,
    filterScore,
    filterMethod: "llm",
    filterProfileHash: "profile",
    filterCheckedAt: "2026-06-02T00:00:00.000Z",
    filterError: null,
    analysisSummaryZh: null,
    analysisProblemZh: null,
    analysisMethodZh: null,
    analysisContributionZh: null,
    analysisDetailZh: null,
    analysisModel: null,
    analysisCheckedAt: null,
    analysisError: null,
    pdfAnalysisOverviewZh: null,
    pdfAnalysisBackgroundZh: null,
    pdfAnalysisProblemFormulationZh: null,
    pdfAnalysisMethodZh: null,
    pdfAnalysisKeyIdeasZh: null,
    pdfAnalysisExperimentsZh: null,
    pdfAnalysisLimitationsZh: null,
    pdfAnalysisReadingGuideZh: null,
    pdfAnalysisAffiliations: null,
    pdfAnalysisModel: null,
    pdfAnalysisCheckedAt: null,
    pdfAnalysisError: null,
    keywordTags: [],
    userTags: [],
    githubUrls: [],
    createdAt: publishedAt,
    updatedRecordAt: publishedAt,
    ...overrides
  };
}
