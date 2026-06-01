import type { AiConnectionConfig } from "@/lib/ai/client";
import type { InterestFilterResult } from "@/lib/filtering/types";
import type { PaperInput } from "@/lib/papers/types";

type FetchLike = typeof fetch;

export async function classifyPapersWithLlm(
  papers: PaperInput[],
  options: {
    interestProfile: string;
    profileHash: string;
    config: AiConnectionConfig;
    fetcher?: FetchLike;
  }
): Promise<InterestFilterResult[]> {
  if (papers.length === 0) return [];

  const baseUrl = options.config.baseUrl.trim();
  const model = options.config.model.trim();
  const apiKey = options.config.apiKey.trim();
  if (!baseUrl || !model || !apiKey) {
    throw new Error("AI_BASE_URL, AI_MODEL, and AI_API_KEY must all be configured before filtering papers.");
  }

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${baseUrl.replace(/\/+$/, "")}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt() }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt(options.interestProfile, papers) }]
        }
      ],
      max_output_tokens: 1200,
      stream: true
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`AI filter request failed with ${response.status}. ${sanitizeProviderError(body, apiKey)}`);
  }

  return normalizeLlmResults(parseLlmJsonArray(await readStreamingText(response)), papers, options.profileHash);
}

function systemPrompt(): string {
  return [
    "You filter arXiv papers for a personal research inbox.",
    "Return only a JSON array. Do not include markdown.",
    "Each item must be {\"sourceId\": string, \"matched\": boolean, \"score\": number}.",
    "matched means the paper is relevant to the user's current research interests based on title, abstract, and categories.",
    "score must be between 0 and 1."
  ].join("\n");
}

function userPrompt(interestProfile: string, papers: PaperInput[]): string {
  return JSON.stringify({
    interestProfile,
    papers: papers.map((paper) => ({
      sourceId: paper.sourceId,
      title: paper.title,
      abstract: paper.abstract,
      categories: paper.categories,
      primaryCategory: paper.primaryCategory
    }))
  });
}

async function readStreamingText(response: Response): Promise<string> {
  const text = await response.text();
  let output = "";

  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice("data:".length).trim();
    if (!data || data === "[DONE]") continue;
    const event = JSON.parse(data) as { type?: string; delta?: string; text?: string };
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      output += event.delta;
    } else if (event.type === "response.output_text.done" && !output && typeof event.text === "string") {
      output = event.text;
    }
  }

  return output.trim();
}

function parseLlmJsonArray(text: string): Array<{ sourceId: string; matched: boolean; score: number }> {
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) throw new Error("AI filter returned non-array JSON.");
  return parsed.map((item) => {
    if (!item || typeof item !== "object") throw new Error("AI filter returned an invalid item.");
    const record = item as Record<string, unknown>;
    if (typeof record.sourceId !== "string" || typeof record.matched !== "boolean" || typeof record.score !== "number") {
      throw new Error("AI filter returned an item with invalid fields.");
    }
    return {
      sourceId: record.sourceId,
      matched: record.matched,
      score: clampScore(record.score)
    };
  });
}

function normalizeLlmResults(
  rawResults: Array<{ sourceId: string; matched: boolean; score: number }>,
  papers: PaperInput[],
  profileHash: string
): InterestFilterResult[] {
  const checkedAt = new Date().toISOString();
  const bySourceId = new Map(rawResults.map((result) => [result.sourceId, result]));
  return papers.map((paper) => {
    const result = bySourceId.get(paper.sourceId);
    if (!result) {
      throw new Error(`AI filter did not return a result for ${paper.sourceId}.`);
    }
    return {
      sourceId: paper.sourceId,
      matched: result.matched,
      score: result.score,
      method: "llm",
      profileHash,
      checkedAt,
      error: null
    };
  });
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sanitizeProviderError(message: string, apiKey: string): string {
  return apiKey ? message.replaceAll(apiKey, "[redacted]") : message;
}
