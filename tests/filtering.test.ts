import { describe, expect, it, vi } from "vitest";

import { filterPapersByInterest, getInterestProfileHash, prefilterPaperForInterest } from "../lib/filtering/interest-filter";
import { classifyPapersWithLlm } from "../lib/filtering/llm-filter";
import type { PaperInput } from "../lib/papers/types";

describe("interest filtering", () => {
  it("uses local rules to reject clearly unrelated papers before AI", () => {
    const decision = prefilterPaperForInterest(makePaper({
      sourceId: "2601.00001",
      title: "A benchmark for liver tumor segmentation in CT images",
      abstract: "We study medical image segmentation with convolutional networks.",
      categories: ["cs.CV"],
      primaryCategory: "cs.CV"
    }), "大语言模型推理和 agentic RL");

    expect(decision).toMatchObject({
      action: "reject",
      matched: false,
      method: "prefilter"
    });
  });

  it("sends possible matches to AI in batches and combines prefilter rejections", async () => {
    const classify = vi.fn().mockResolvedValue([
      { sourceId: "2601.00002", matched: true, score: 0.9, method: "llm", profileHash: "hash", checkedAt: "now", error: null }
    ]);
    const papers = [
      makePaper({
        sourceId: "2601.00001",
        title: "A benchmark for liver tumor segmentation in CT images",
        abstract: "We study medical image segmentation with convolutional networks.",
        categories: ["cs.CV"],
        primaryCategory: "cs.CV"
      }),
      makePaper({
        sourceId: "2601.00002",
        title: "LongTraceRL: Learning Long-Context Reasoning from Search Agent Trajectories",
        abstract: "We train language model agents with reinforcement learning and rubric rewards."
      })
    ];

    const results = await filterPapersByInterest(papers, {
      interestProfile: "大语言模型推理、agentic RL、tool use",
      classify
    });

    expect(classify).toHaveBeenCalledWith([papers[1]], expect.objectContaining({
      interestProfile: "大语言模型推理、agentic RL、tool use"
    }));
    expect(results).toEqual([
      expect.objectContaining({ sourceId: "2601.00001", matched: false, method: "prefilter" }),
      expect.objectContaining({ sourceId: "2601.00002", matched: true, method: "llm" })
    ]);
  });

  it("classifies a batch through the streaming Responses API", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response([
      "event: response.output_text.delta",
      "data: {\"type\":\"response.output_text.delta\",\"delta\":\"[{\\\"sourceId\\\":\\\"2601.00002\\\",\\\"matched\\\":true,\"}",
      "",
      "event: response.output_text.delta",
      "data: {\"type\":\"response.output_text.delta\",\"delta\":\"\\\"score\\\":0.92}]\"}",
      "",
      "data: [DONE]",
      ""
    ].join("\n"), { status: 200 }));

    const results = await classifyPapersWithLlm([makePaper({ sourceId: "2601.00002" })], {
      interestProfile: "大语言模型推理",
      profileHash: "profile-hash",
      config: {
        baseUrl: "https://api.example.com/v1",
        model: "test-model",
        apiKey: "test-key"
      },
      fetcher
    });

    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));

    expect(fetcher).toHaveBeenCalledWith("https://api.example.com/v1/responses", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-key" })
    }));
    expect(body.stream).toBe(true);
    expect(body.input).toEqual(expect.any(Array));
    expect(results).toEqual([
      {
        sourceId: "2601.00002",
        matched: true,
        score: 0.92,
        method: "llm",
        profileHash: "profile-hash",
        checkedAt: expect.any(String),
        error: null
      }
    ]);
  });

  it("hashes interest profiles stably", () => {
    expect(getInterestProfileHash("  大语言模型推理  ")).toBe(getInterestProfileHash("大语言模型推理"));
  });
});

function makePaper(overrides: Partial<PaperInput> = {}): PaperInput {
  return {
    source: "arxiv",
    sourceId: "2601.00002",
    title: "LongTraceRL: Learning Long-Context Reasoning from Search Agent Trajectories",
    abstract: "We train language model agents with reinforcement learning and rubric rewards.",
    authors: ["Ada Lovelace"],
    categories: ["cs.CL", "cs.AI", "cs.LG"],
    primaryCategory: "cs.CL",
    publishedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    sourceUrl: "https://arxiv.org/abs/2601.00002",
    pdfUrl: "https://arxiv.org/pdf/2601.00002",
    ...overrides
  };
}
