import type { AiConnectionConfig } from "@/lib/ai/client";
import { getAiConnectionConfigFromEnv } from "@/lib/ai/client";
import type { PaperAnalysisResult, PaperInput } from "@/lib/papers/types";
import { getPreferredKeywordTags } from "@/lib/user-preferences/research-interest";

type FetchLike = typeof fetch;
const ANALYSIS_TIMEOUT_MS = 90_000;

export type PaperAnalysisWithSourceId = PaperAnalysisResult & {
  sourceId: string;
};

export async function analyzePapersWithLlm(
  papers: PaperInput[],
  options: {
    config?: AiConnectionConfig;
    fetcher?: FetchLike;
  } = {}
): Promise<PaperAnalysisWithSourceId[]> {
  const config = options.config ?? getAiConnectionConfigFromEnv();
  return Promise.all(papers.map((paper) => analyzeOnePaper(paper, config, options.fetcher ?? fetch)));
}

async function analyzeOnePaper(paper: PaperInput, config: AiConnectionConfig, fetcher: FetchLike): Promise<PaperAnalysisWithSourceId> {
  const baseUrl = config.baseUrl.trim();
  const model = config.model.trim();
  const apiKey = config.apiKey.trim();
  if (!baseUrl || !model || !apiKey) {
    throw new Error("AI_BASE_URL, AI_MODEL, and AI_API_KEY must all be configured before analyzing papers.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

  try {
    const response = await fetcher(`${baseUrl.replace(/\/+$/, "")}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt() }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt(paper) }]
          }
        ],
        max_output_tokens: 1800,
        stream: true
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`AI paper analysis request failed with ${response.status}. ${sanitizeProviderError(body, apiKey)}`);
    }

    return normalizeAnalysis(paper.sourceId, parseAnalysisJson(await readStreamingText(response)), model);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("AI paper analysis request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function systemPrompt(): string {
  const preferredTags = getPreferredKeywordTags().join(", ");
  return [
    "You write Chinese reading notes for one arXiv paper.",
    "Return only JSON. Do not include markdown.",
    "The JSON must be {\"summaryZh\": string, \"problemZh\": string, \"methodZh\": string, \"contributionZh\": string, \"detailZh\": string, \"keywordTags\": string[]}.",
    "summaryZh must be one concise Chinese sentence explaining what the paper is about.",
    "problemZh must explain the problem the paper solves in 1-2 Chinese sentences.",
    "methodZh must explain the core method in 1-2 Chinese sentences.",
    "contributionZh must explain the main contribution in 1-2 Chinese sentences.",
    "detailZh must be a richer Chinese explanation for a detail page, covering background, method flow, experiments, limitations, and what the reader should take away.",
    "keywordTags must contain 2-5 compact core tags for the paper, not author-provided full keyword lists.",
    `Prefer canonical tags from this controlled vocabulary: ${preferredTags}.`,
    "Allow at most one highly central paper-specific method acronym, such as OPD, when it is genuinely core.",
    "Do not output broad generic tags such as LLM, AI, Deep Learning, Transformer, Benchmark, or NLP unless they are part of a specific canonical tag."
  ].join("\n");
}

function userPrompt(paper: PaperInput): string {
  return JSON.stringify({
    title: paper.title,
    abstract: paper.abstract,
    authors: paper.authors,
    categories: paper.categories,
    primaryCategory: paper.primaryCategory
  });
}

function parseAnalysisJson(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI paper analysis returned non-object JSON.");
  }
  return parsed as Record<string, unknown>;
}

function normalizeAnalysis(sourceId: string, raw: Record<string, unknown>, model: string): PaperAnalysisWithSourceId {
  return {
    sourceId,
    summaryZh: requireString(raw.summaryZh, "summaryZh"),
    problemZh: requireString(raw.problemZh, "problemZh"),
    methodZh: requireString(raw.methodZh, "methodZh"),
    contributionZh: requireString(raw.contributionZh, "contributionZh"),
    detailZh: requireString(raw.detailZh, "detailZh"),
    keywordTags: requireKeywordTags(raw.keywordTags),
    model,
    checkedAt: new Date().toISOString(),
    error: null
  };
}

function requireKeywordTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("AI paper analysis returned invalid keywordTags.");
  }
  const tags = normalizeKeywordTags(value);
  if (tags.length === 0) {
    throw new Error("AI paper analysis returned empty keywordTags.");
  }
  return tags;
}

function normalizeKeywordTags(value: unknown[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const tag = item.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= 5) break;
  }
  return tags;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`AI paper analysis returned invalid ${field}.`);
  }
  return value.trim();
}

async function readStreamingText(response: Response): Promise<string> {
  if (!response.body) return readStreamingLines(await response.text());

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let output = "";
  let buffer = "";

  const readLine = (line: string): boolean => {
    const result = readStreamingLine(line, output);
    output = result.output;
    return result.done;
  };

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;

      buffer += decoder.decode(chunk.value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
        buffer = buffer.slice(newlineIndex + 1);
        if (readLine(line)) {
          await reader.cancel().catch(() => undefined);
          return output.trim();
        }
        newlineIndex = buffer.indexOf("\n");
      }
    }

    buffer += decoder.decode();
    for (const line of buffer.split(/\r?\n/)) {
      if (readLine(line)) return output.trim();
    }
  } finally {
    reader.releaseLock();
  }

  return output.trim();
}

function readStreamingLines(text: string): string {
  let output = "";
  for (const line of text.split(/\r?\n/)) {
    const result = readStreamingLine(line, output);
    output = result.output;
    if (result.done) break;
  }
  return output.trim();
}

function readStreamingLine(line: string, currentOutput: string): { output: string; done: boolean } {
  if (!line.startsWith("data:")) return { output: currentOutput, done: false };
  const data = line.slice("data:".length).trim();
  if (!data) return { output: currentOutput, done: false };
  if (data === "[DONE]") return { output: currentOutput, done: true };

  const event = JSON.parse(data) as { type?: string; delta?: string; text?: string };
  if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
    return { output: currentOutput + event.delta, done: false };
  }
  if (event.type === "response.output_text.done" && !currentOutput && typeof event.text === "string") {
    return { output: event.text, done: false };
  }
  return { output: currentOutput, done: false };
}

function sanitizeProviderError(message: string, apiKey: string): string {
  return apiKey ? message.replaceAll(apiKey, "[redacted]") : message;
}
