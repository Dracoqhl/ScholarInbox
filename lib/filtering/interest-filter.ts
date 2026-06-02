import { createHash } from "node:crypto";

import { classifyPapersWithLlm } from "@/lib/filtering/llm-filter";
import type { InterestFilterResult } from "@/lib/filtering/types";
import type { AiConnectionConfig } from "@/lib/ai/client";
import { getAiConnectionConfigFromEnv } from "@/lib/ai/client";
import type { PaperInput } from "@/lib/papers/types";

const AI_BATCH_SIZE = 15;

const POSITIVE_TERMS = [
  "large language model",
  "language model",
  "llm",
  "post-training",
  "post training",
  "reasoning",
  "test-time",
  "test time",
  "rlhf",
  "dpo",
  "rlaif",
  "agent",
  "tool use",
  "multi-agent",
  "reinforcement learning",
  "alignment",
  "long-context",
  "long context"
];

const CLEARLY_UNRELATED_TERMS = [
  "multimodal",
  "vision-language",
  "vision language",
  "vlm",
  "image",
  "video",
  "visual",
  "embodied",
  "robot",
  "robotics",
  "navigation",
  "manipulation",
  "autonomous driving",
  "control",
  "segmentation",
  "medical image",
  "ct images",
  "mri",
  "remote sensing",
  "diffusion mri",
  "sensor",
  "time-series forecasting",
  "protein",
  "molecule"
];

export type PrefilterDecision =
  | { action: "ai" }
  | Omit<InterestFilterResult, "profileHash" | "checkedAt"> & { action: "reject" };

export type InterestFilterOptions = {
  interestProfile: string;
  classify?: (papers: PaperInput[], options: BatchClassifyOptions) => Promise<InterestFilterResult[]>;
  config?: AiConnectionConfig;
  batchSize?: number;
};

export type BatchClassifyOptions = {
  interestProfile: string;
  profileHash: string;
  config?: AiConnectionConfig;
};

export async function filterPapersByInterest(papers: PaperInput[], options: InterestFilterOptions): Promise<InterestFilterResult[]> {
  const profileHash = getInterestProfileHash(options.interestProfile);
  const checkedAt = new Date().toISOString();
  const results: InterestFilterResult[] = [];
  const candidates: PaperInput[] = [];

  for (const paper of papers) {
    const prefilter = prefilterPaperForInterest(paper, options.interestProfile);
    if (prefilter.action === "reject") {
      results.push({
        sourceId: prefilter.sourceId,
        matched: prefilter.matched,
        score: prefilter.score,
        method: prefilter.method,
        profileHash,
        checkedAt,
        error: prefilter.error
      });
    } else {
      candidates.push(paper);
    }
  }

  const classify = options.classify ?? classifyPapersWithLlm;
  const batchSize = options.batchSize ?? AI_BATCH_SIZE;
  for (let index = 0; index < candidates.length; index += batchSize) {
    results.push(
      ...(await classify(candidates.slice(index, index + batchSize), {
        interestProfile: options.interestProfile,
        profileHash,
        config: options.config ?? getAiConnectionConfigFromEnv()
      }))
    );
  }

  const order = new Map(papers.map((paper, index) => [paper.sourceId, index]));
  return results.sort((left, right) => (order.get(left.sourceId) ?? 0) - (order.get(right.sourceId) ?? 0));
}

export function prefilterPaperForInterest(paper: PaperInput, _interestProfile: string): PrefilterDecision {
  const text = `${paper.title} ${paper.abstract} ${paper.categories.join(" ")} ${paper.primaryCategory}`.toLowerCase();
  const hasPositiveSignal = POSITIVE_TERMS.some((term) => text.includes(term));
  const hasClearlyUnrelatedSignal = CLEARLY_UNRELATED_TERMS.some((term) => text.includes(term));
  const categoryLooksRelevant = paper.categories.some((category) => ["cs.CL", "cs.AI", "cs.LG"].includes(category));

  if (!hasPositiveSignal && hasClearlyUnrelatedSignal) {
    return {
      action: "reject",
      sourceId: paper.sourceId,
      matched: false,
      score: 0,
      method: "prefilter",
      error: null
    };
  }

  return { action: "ai" };
}

export function getInterestProfileHash(interestProfile: string): string {
  return createHash("sha256").update(interestProfile.trim().replace(/\s+/g, " ")).digest("hex");
}
