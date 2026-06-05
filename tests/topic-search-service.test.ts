import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDatabase } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";
import { createPaperRepository } from "@/lib/papers/repository";
import type { PaperAnalysisWithSourceId } from "@/lib/paper-analysis/llm-analysis";
import type { PaperInput } from "@/lib/papers/types";
import { parseTopicSearchProfile } from "@/lib/topic-search/profile";
import { runTopicSearch } from "@/lib/topic-search/service";
import type { TopicSearchCandidate } from "@/lib/topic-search/types";

describe("topic search service", () => {
  let dir: string;
  let databasePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "topic-search-service-"));
    databasePath = join(dir, "test.sqlite");
    const db = getDatabase(databasePath);
    ensureDatabaseSchema(db);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("imports accepted deduped candidates as new matched papers with a public topic tag", async () => {
    const db = getDatabase(databasePath);
    const profile = makeProfile();
    const candidates = [
      makeCandidate({ discoveryChannel: "arxiv_search", externalIds: { arxiv: "2401.00123" }, matchedQueries: ["OPD"] }),
      makeCandidate({ discoveryChannel: "semantic_scholar", externalIds: { arxiv: "2401.00123", semanticScholar: "S2-A" }, matchedQueries: ["online policy distillation"] })
    ];
    let pdfAnalysisCount = 0;

    const run = await runTopicSearch({
      db,
      profile,
      dateFrom: "2023-01-01",
      dateTo: "2026-06-05",
      sources: ["arxiv", "semantic_scholar"],
      fetchCandidates: async () => candidates,
      filterCandidates: async (deduped) =>
        deduped.map((candidate) => ({
          dedupeKey: candidate.dedupeKey,
          accepted: true,
          score: 0.91,
          reason: "Matches OPD policy distillation."
        })),
      analyzePapers: async (papers) => papers.map(makeAnalysis),
      analyzePaperPdf: async (paper) => {
        pdfAnalysisCount += 1;
        return paper;
      }
    });

    const paperRepository = createPaperRepository(db);
    const papers = await paperRepository.list({ matched: true, query: "OPD" });

    expect(run).toMatchObject({
      status: "completed",
      candidateCount: 2,
      dedupedCount: 1,
      acceptedCount: 1,
      insertedCount: 1,
      existingCount: 0
    });
    expect(papers).toHaveLength(1);
    expect(papers[0]).toMatchObject({
      title: "OPD for LLM Reasoning",
      status: "new",
      analysisSummaryZh: "这是一篇关于 OPD 的论文。"
    });
    expect(papers[0].userTags.map((tag) => tag.name)).toEqual(["OPD"]);
    expect(papers[0].topicMatches[0]).toMatchObject({
      profileSlug: "opd",
      profileScore: 0.91,
      matchedQueries: ["OPD", "online policy distillation"],
      discoveryChannels: ["arxiv_search", "semantic_scholar"],
      canonicalPlatform: "arxiv"
    });
    expect(pdfAnalysisCount).toBe(1);
  });

  it("does not duplicate an existing paper when a topic run finds it again", async () => {
    const db = getDatabase(databasePath);
    const profile = makeProfile();
    const candidate = makeCandidate({ externalIds: { arxiv: "2401.00123" } });
    const first = await runTopicSearch({
      db,
      profile,
      dateFrom: profile.dateFrom,
      dateTo: profile.dateTo,
      sources: ["arxiv"],
      fetchCandidates: async () => [candidate],
      filterCandidates: acceptAll,
      analyzePapers: async (papers) => papers.map(makeAnalysis),
      analyzePaperPdf: async (paper) => paper
    });
    const second = await runTopicSearch({
      db,
      profile,
      dateFrom: profile.dateFrom,
      dateTo: profile.dateTo,
      sources: ["arxiv"],
      fetchCandidates: async () => [candidate],
      filterCandidates: acceptAll,
      analyzePapers: async (papers) => papers.map(makeAnalysis),
      analyzePaperPdf: async (paper) => paper
    });

    expect(first.insertedCount).toBe(1);
    expect(second.insertedCount).toBe(0);
    expect(second.existingCount).toBe(1);
    expect(await createPaperRepository(db).list({ matched: true })).toHaveLength(1);
  });
});

function makeProfile() {
  return parseTopicSearchProfile("data/search-profiles/opd.md", `# OPD

slug: opd
label: OPD
publicTag: OPD
dateFrom: 2023-01-01
dateTo: 2026-06-05
sources:
  - arxiv
  - semantic_scholar

## Include

Policy distillation for LLM reasoning.

## Exclude

Multimodal work.

## Query Seeds

- OPD
- online policy distillation
`);
}

function makeCandidate(input: Partial<TopicSearchCandidate> = {}): TopicSearchCandidate {
  return {
    paper: makePaperInput(),
    discoveryChannel: "arxiv_search",
    matchedQueries: ["OPD"],
    canonicalPlatform: "arxiv",
    canonicalUrl: "https://arxiv.org/abs/2401.00123",
    externalIds: { arxiv: "2401.00123" },
    ...input
  };
}

function makePaperInput(): PaperInput {
  return {
    source: "arxiv",
    sourceId: "2401.00123",
    title: "OPD for LLM Reasoning",
    abstract: "A paper about policy distillation for LLM reasoning.",
    authors: ["Ada Lovelace"],
    categories: ["cs.AI"],
    primaryCategory: "cs.AI",
    publishedAt: "2026-06-01T00:00:00.000Z",
    updatedAt: null,
    sourceUrl: "https://arxiv.org/abs/2401.00123",
    pdfUrl: "https://arxiv.org/pdf/2401.00123"
  };
}

function makeAnalysis(paper: PaperInput): PaperAnalysisWithSourceId {
  return {
    sourceId: paper.sourceId,
    summaryZh: "这是一篇关于 OPD 的论文。",
    problemZh: "它研究如何提升 LLM 推理。",
    methodZh: "它使用策略蒸馏。",
    contributionZh: "它展示了 OPD 的效果。",
    detailZh: "这是一段详情解析。",
    keywordTags: ["OPD", "Reasoning"],
    model: "test-model",
    checkedAt: "2026-06-05T00:00:00.000Z",
    error: null
  };
}

async function acceptAll(candidates: Array<{ dedupeKey: string }>) {
  return candidates.map((candidate) => ({
    dedupeKey: candidate.dedupeKey,
    accepted: true,
    score: 0.9,
    reason: "Accepted."
  }));
}
