import { describe, expect, it } from "vitest";

import { dedupeTopicSearchCandidates } from "@/lib/topic-search/dedupe";
import type { TopicSearchCandidate } from "@/lib/topic-search/types";

describe("topic search dedupe", () => {
  it("merges candidates that share an arXiv id", () => {
    const candidates = dedupeTopicSearchCandidates([
      makeCandidate({
        discoveryChannel: "arxiv_search",
        matchedQueries: ["OPD"],
        externalIds: { arxiv: "2401.00123" }
      }),
      makeCandidate({
        discoveryChannel: "semantic_scholar",
        matchedQueries: ["online policy distillation"],
        externalIds: { arxiv: "2401.00123", semanticScholar: "S2" }
      })
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].dedupeKey).toBe("arxiv:2401.00123");
    expect(candidates[0].discoveryChannels).toEqual(["arxiv_search", "semantic_scholar"]);
    expect(candidates[0].matchedQueries).toEqual(["OPD", "online policy distillation"]);
    expect(candidates[0].externalIds).toEqual({ arxiv: "2401.00123", semanticScholar: "S2" });
  });

  it("deduplicates by Semantic Scholar id before title", () => {
    const candidates = dedupeTopicSearchCandidates([
      makeCandidate({
        title: "Policy Distillation for LLM Reasoning",
        externalIds: { semanticScholar: "S2-A" }
      }),
      makeCandidate({
        title: "A Different Title",
        externalIds: { semanticScholar: "S2-A" }
      })
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].dedupeKey).toBe("semantic_scholar:S2-A");
  });

  it("falls back to normalized title when no stable external id exists", () => {
    const candidates = dedupeTopicSearchCandidates([
      makeCandidate({ title: "Policy Distillation for LLM Reasoning!" }),
      makeCandidate({ title: "policy distillation  for llm reasoning" })
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].dedupeKey).toBe("title:policy-distillation-for-llm-reasoning");
  });
});

function makeCandidate(input: Partial<TopicSearchCandidate> & { title?: string } = {}): TopicSearchCandidate {
  const title = input.title ?? "Policy Distillation for LLM Reasoning";
  return {
    paper: {
      source: input.externalIds?.arxiv ? "arxiv" : "semantic_scholar",
      sourceId: input.externalIds?.arxiv ?? input.externalIds?.semanticScholar ?? "candidate-without-stable-id",
      title,
      abstract: "A paper about policy distillation and LLM reasoning.",
      authors: ["Ada Lovelace"],
      categories: ["cs.AI"],
      primaryCategory: "cs.AI",
      publishedAt: "2026-06-01T00:00:00.000Z",
      updatedAt: null,
      sourceUrl: "https://arxiv.org/abs/2401.00123",
      pdfUrl: "https://arxiv.org/pdf/2401.00123"
    },
    discoveryChannel: "arxiv_search",
    matchedQueries: ["OPD"],
    canonicalPlatform: "arxiv",
    canonicalUrl: "https://arxiv.org/abs/2401.00123",
    externalIds: {},
    ...input
  };
}
