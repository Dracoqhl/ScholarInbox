import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { analyzePdfTextWithLlm } from "../lib/pdf-analysis/llm-pdf-analysis";
import { generateAndStorePdfAnalysis } from "../lib/pdf-analysis/service";
import { getDatabase } from "../lib/db/database";
import { ensureDatabaseSchema } from "../lib/db/schema";
import { createPaperRepository } from "../lib/papers/repository";
import type { PaperInput } from "../lib/papers/types";

describe("PDF paper analysis", () => {
  let dir: string;
  let databasePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scholar-inbox-pdf-analysis-test-"));
    databasePath = join(dir, "test.sqlite");
    ensureDatabaseSchema(getDatabase(databasePath));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("stores a deep PDF analysis for a paper", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const { paper } = await repository.upsert(makePaperInput());
    let receivedText = "";

    const updated = await generateAndStorePdfAnalysis({
      paperRepository: repository,
      paper,
      extractPdfText: async () => "PDF full text with method, experiments, and affiliations.",
      analyzePdfText: async (_paper, text) => {
        receivedText = text;
        return {
          overviewZh: "这篇论文系统研究了语言模型如何通过过程信号改进复杂推理。",
          backgroundZh: "背景是长链推理任务中只有最终答案奖励会导致监督稀疏。",
          problemFormulationZh: "论文把任务形式化为给定问题和上下文，生成可验证推理轨迹。",
          methodZh: "方法包括构造轨迹、设计过程奖励，并用后训练优化模型。",
          keyIdeasZh: "关键思想是把中间推理质量也纳入奖励，而不是只看最终答案。",
          experimentsZh: "实验比较了多个推理基准，显示过程奖励能提升稳定性。",
          limitationsZh: "局限是依赖可验证任务和高质量轨迹构造。",
          readingGuideZh: "精读时优先看方法章节、reward 设计和 ablation。",
          affiliations: "Example University; Example Lab",
          model: "test-pdf-analysis-model",
          checkedAt: "2026-06-02T00:00:00.000Z",
          error: null
        };
      }
    });

    expect(receivedText).toContain("PDF full text");
    expect(updated).toMatchObject({
      pdfAnalysisOverviewZh: "这篇论文系统研究了语言模型如何通过过程信号改进复杂推理。",
      pdfAnalysisAffiliations: "Example University; Example Lab",
      pdfAnalysisModel: "test-pdf-analysis-model"
    });
    expect(await repository.get(paper.id)).toMatchObject({
      pdfAnalysisMethodZh: "方法包括构造轨迹、设计过程奖励，并用后训练优化模型。",
      pdfAnalysisReadingGuideZh: "精读时优先看方法章节、reward 设计和 ablation。"
    });
  });

  it("requests streaming Responses API output for PDF analysis", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const { paper } = await repository.upsert(makePaperInput());
    let requestUrl = "";
    let requestBody: Record<string, unknown> | null = null;

    const analysis = await analyzePdfTextWithLlm(paper, "full PDF text", {
      config: {
        baseUrl: "https://api.example.test/v1",
        model: "test-model",
        apiKey: "test-key"
      },
      fetcher: async (url, init) => {
        requestUrl = String(url);
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          [
            `data: ${JSON.stringify({ type: "response.output_text.delta", delta: JSON.stringify(makeLlmJson()) })}`,
            "data: [DONE]"
          ].join("\n"),
          { status: 200 }
        );
      }
    });

    expect(requestUrl).toBe("https://api.example.test/v1/responses");
    expect(requestBody).toMatchObject({ model: "test-model", stream: true });
    expect(analysis).toMatchObject({
      overviewZh: "PDF 导读",
      affiliations: "Example University",
      model: "test-model",
      error: null
    });
  });
});

function makeLlmJson() {
  return {
    overviewZh: "PDF 导读",
    backgroundZh: "背景",
    problemFormulationZh: "问题定义",
    methodZh: "方法",
    keyIdeasZh: "关键思想",
    experimentsZh: "实验",
    limitationsZh: "局限",
    readingGuideZh: "阅读建议",
    affiliations: "Example University"
  };
}

function makePaperInput(): PaperInput {
  return {
    source: "arxiv",
    sourceId: "2401.01010",
    title: "Process Rewards for Language Model Reasoning",
    abstract: "We study process rewards for large language model reasoning.",
    authors: ["Ada Lovelace"],
    categories: ["cs.CL"],
    primaryCategory: "cs.CL",
    publishedAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    sourceUrl: "https://arxiv.org/abs/2401.01010",
    pdfUrl: "https://arxiv.org/pdf/2401.01010"
  };
}
