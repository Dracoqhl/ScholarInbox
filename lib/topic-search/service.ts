import type { SqliteDatabase } from "@/lib/db/database";
import { classifyPapersWithLlm } from "@/lib/filtering/llm-filter";
import { getInterestProfileHash } from "@/lib/filtering/interest-filter";
import { getAiConnectionConfigFromEnv } from "@/lib/ai/client";
import { analyzePapersWithLlm, type PaperAnalysisWithSourceId } from "@/lib/paper-analysis/llm-analysis";
import { generateAndStorePdfAnalysis } from "@/lib/pdf-analysis/service";
import { createPaperRepository } from "@/lib/papers/repository";
import type { Paper, UserTag } from "@/lib/papers/types";
import { getResearchInterestProfile } from "@/lib/user-preferences/research-interest";
import { dedupeTopicSearchCandidates } from "@/lib/topic-search/dedupe";
import type { TopicSearchProfile, TopicSearchSource } from "@/lib/topic-search/profile";
import { createTopicSearchRepository } from "@/lib/topic-search/repository";
import { fetchArxivTopicCandidates } from "@/lib/topic-search/sources/arxiv-search";
import { fetchSemanticScholarTopicCandidates } from "@/lib/topic-search/sources/semantic-scholar";
import type { DedupedTopicSearchCandidate, TopicFilterResult, TopicSearchCandidate, TopicSearchRun } from "@/lib/topic-search/types";

const TOPIC_TAG_COLOR = "#7c3aed";

export type RunTopicSearchInput = {
  db: SqliteDatabase;
  profile: TopicSearchProfile;
  dateFrom: string;
  dateTo: string;
  sources: TopicSearchSource[];
  maxResults?: number;
  fetchCandidates?: (input: { profile: TopicSearchProfile; dateFrom: string; dateTo: string; sources: TopicSearchSource[]; maxResults: number }) => Promise<TopicSearchCandidate[]>;
  filterCandidates?: (candidates: DedupedTopicSearchCandidate[], input: { profile: TopicSearchProfile }) => Promise<TopicFilterResult[]>;
  analyzePapers?: (papers: DedupedTopicSearchCandidate["paper"][]) => Promise<PaperAnalysisWithSourceId[]>;
  analyzePaperPdf?: (paper: Paper) => Promise<Paper>;
};

export async function runTopicSearch(input: RunTopicSearchInput): Promise<TopicSearchRun> {
  const topicRepository = createTopicSearchRepository(input.db);
  const paperRepository = createPaperRepository(input.db);
  const profileRecord = await topicRepository.upsertProfile({
    slug: input.profile.slug,
    label: input.profile.label,
    publicTag: input.profile.publicTag,
    filePath: input.profile.filePath,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    sources: input.sources,
    profileHash: input.profile.profileHash
  });
  const run = await topicRepository.startRun({
    profileId: profileRecord.id,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    sources: input.sources
  });

  try {
    await topicRepository.appendRunLog(run.id, {
      level: "info",
      stage: "submitted",
      message: "Started topic search.",
      details: {
        profile: input.profile.slug,
        sources: input.sources,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo
      }
    });

    const maxResults = Math.max(1, Math.min(input.maxResults ?? 100, 500));
    const fetchCandidates = input.fetchCandidates ?? fetchTopicCandidatesFromSources;
    const rawCandidates = await fetchCandidates({ profile: input.profile, dateFrom: input.dateFrom, dateTo: input.dateTo, sources: input.sources, maxResults });
    await topicRepository.appendRunLog(run.id, {
      level: "info",
      stage: "retrieving",
      message: "Retrieved topic search candidates.",
      details: { candidateCount: rawCandidates.length }
    });

    const dedupedCandidates = dedupeTopicSearchCandidates(rawCandidates);
    await topicRepository.appendRunLog(run.id, {
      level: "info",
      stage: "deduplicating",
      message: "Deduplicated topic search candidates.",
      details: { candidateCount: rawCandidates.length, dedupedCount: dedupedCandidates.length }
    });

    const filterCandidates = input.filterCandidates ?? filterTopicCandidatesWithLlm;
    const filterResults = await filterCandidates(dedupedCandidates, { profile: input.profile });
    const filterByKey = new Map(filterResults.map((result) => [result.dedupeKey, result]));
    const acceptedCandidates = dedupedCandidates.filter((candidate) => filterByKey.get(candidate.dedupeKey)?.accepted);
    await topicRepository.appendRunLog(run.id, {
      level: "info",
      stage: "filtering",
      message: "Filtered topic candidates.",
      details: { acceptedCount: acceptedCandidates.length, rejectedCount: dedupedCandidates.length - acceptedCandidates.length }
    });

    const publicTag = await paperRepository.createUserTag({ name: input.profile.publicTag, color: TOPIC_TAG_COLOR });
    let insertedCount = 0;
    let existingCount = 0;
    const homepageAnalysisCandidates: Array<{ paperId: string; candidate: DedupedTopicSearchCandidate }> = [];
    const pdfAnalysisCandidates: Paper[] = [];

    for (const candidate of acceptedCandidates) {
      const filterResult = filterByKey.get(candidate.dedupeKey);
      const upserted = await paperRepository.upsert(candidate.paper);
      if (upserted.inserted) insertedCount += 1;
      else existingCount += 1;

      await attachPublicTag(paperRepository, upserted.paper, publicTag);
      await topicRepository.upsertPaperMatch({
        paperId: upserted.paper.id,
        profileId: profileRecord.id,
        runId: run.id,
        profileSlug: input.profile.slug,
        profileLabel: input.profile.label,
        publicTag: input.profile.publicTag,
        profileScore: filterResult?.score ?? null,
        matchedReason: filterResult?.reason ?? "Accepted by topic profile.",
        matchedQueries: candidate.matchedQueries,
        discoveryChannels: candidate.discoveryChannels,
        canonicalPlatform: candidate.canonicalPlatform,
        canonicalUrl: candidate.canonicalUrl,
        externalIds: candidate.externalIds,
        dedupeKey: candidate.dedupeKey
      });

      const storedPaper = await paperRepository.get(upserted.paper.id);
      if (!storedPaper) continue;
      if (!storedPaper.analysisSummaryZh) homepageAnalysisCandidates.push({ paperId: storedPaper.id, candidate });
      if (!storedPaper.pdfAnalysisOverviewZh) pdfAnalysisCandidates.push(storedPaper);
    }

    await topicRepository.appendRunLog(run.id, {
      level: "info",
      stage: "storing",
      message: "Stored accepted topic papers.",
      details: { insertedCount, existingCount }
    });

    if (homepageAnalysisCandidates.length) {
      const analyzePapers = input.analyzePapers ?? analyzePapersWithLlm;
      const analyses = await analyzePapers(homepageAnalysisCandidates.map((candidate) => candidate.candidate.paper));
      const analysisBySourceId = new Map(analyses.map((analysis) => [analysis.sourceId, analysis]));
      for (const candidate of homepageAnalysisCandidates) {
        const analysis = analysisBySourceId.get(candidate.candidate.paper.sourceId);
        if (analysis) await paperRepository.setAnalysisResult(candidate.paperId, analysis);
      }
      await topicRepository.appendRunLog(run.id, {
        level: "info",
        stage: "homepage_analysis",
        message: "Generated homepage Chinese analysis for topic papers.",
        details: { analyzedCount: analyses.length }
      });
    }

    if (pdfAnalysisCandidates.length) {
      const analyzePaperPdf = input.analyzePaperPdf ?? ((paper: Paper) => generateAndStorePdfAnalysis({ paperRepository, paper }));
      let analyzedCount = 0;
      for (const paper of pdfAnalysisCandidates) {
        await analyzePaperPdf(paper);
        analyzedCount += 1;
      }
      await topicRepository.appendRunLog(run.id, {
        level: "info",
        stage: "pdf_analysis",
        message: "Generated PDF detail analysis for topic papers.",
        details: { analyzedCount }
      });
    }

    await topicRepository.appendRunLog(run.id, {
      level: "info",
      stage: "completed",
      message: "Completed topic search.",
      details: { insertedCount, existingCount }
    });
    return topicRepository.finishRun(run.id, {
      status: "completed",
      candidateCount: rawCandidates.length,
      dedupedCount: dedupedCandidates.length,
      acceptedCount: acceptedCandidates.length,
      insertedCount,
      existingCount
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await topicRepository.appendRunLog(run.id, {
      level: "error",
      stage: "failed",
      message: "Topic search failed.",
      details: { error: message }
    });
    return topicRepository.finishRun(run.id, {
      status: "failed",
      candidateCount: 0,
      dedupedCount: 0,
      acceptedCount: 0,
      insertedCount: 0,
      existingCount: 0,
      errorMessage: message
    });
  }
}

async function fetchTopicCandidatesFromSources(input: {
  profile: TopicSearchProfile;
  dateFrom: string;
  dateTo: string;
  sources: TopicSearchSource[];
  maxResults: number;
}): Promise<TopicSearchCandidate[]> {
  const perSourceLimit = Math.max(1, Math.ceil(input.maxResults / Math.max(1, input.sources.length)));
  const candidates: TopicSearchCandidate[] = [];
  for (const source of input.sources) {
    if (source === "arxiv") {
      candidates.push(
        ...(await fetchArxivTopicCandidates({
          querySeeds: input.profile.querySeeds,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          maxResults: perSourceLimit
        }))
      );
    }
    if (source === "semantic_scholar") {
      candidates.push(
        ...(await fetchSemanticScholarTopicCandidates({
          querySeeds: input.profile.querySeeds,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          maxResults: perSourceLimit
        }))
      );
    }
  }
  return candidates.slice(0, input.maxResults);
}

async function filterTopicCandidatesWithLlm(candidates: DedupedTopicSearchCandidate[], input: { profile: TopicSearchProfile }): Promise<TopicFilterResult[]> {
  if (!candidates.length) return [];
  const combinedProfile = [
    "Long-term research interest:",
    getResearchInterestProfile(),
    "",
    "Topic search profile:",
    input.profile.body
  ].join("\n");
  const profileHash = getInterestProfileHash(combinedProfile);
  const results = await classifyPapersWithLlm(candidates.map((candidate) => candidate.paper), {
    interestProfile: combinedProfile,
    profileHash,
    config: getAiConnectionConfigFromEnv()
  });
  const bySourceId = new Map(results.map((result) => [result.sourceId, result]));
  return candidates.map((candidate) => {
    const result = bySourceId.get(candidate.paper.sourceId);
    return {
      dedupeKey: candidate.dedupeKey,
      accepted: Boolean(result?.matched),
      score: result?.score ?? null,
      reason: result?.matched ? "Accepted by AI topic profile filter." : "Rejected by AI topic profile filter."
    };
  });
}

async function attachPublicTag(paperRepository: ReturnType<typeof createPaperRepository>, paper: Paper, tag: UserTag): Promise<void> {
  const existingTagIds = paper.userTags.map((item) => item.id);
  const nextTagIds = existingTagIds.includes(tag.id) ? existingTagIds : [...existingTagIds, tag.id];
  await paperRepository.setUserTags(paper.id, nextTagIds);
}
