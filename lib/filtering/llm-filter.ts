import type { AiConnectionConfig } from "@/lib/ai/client";
import type { InterestFilterResult } from "@/lib/filtering/types";
import type { PaperInput } from "@/lib/papers/types";

type FetchLike = typeof fetch;
const MATCH_SCORE_THRESHOLD = 0.65;
const AI_FILTER_TIMEOUT_MS = 90_000;

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_FILTER_TIMEOUT_MS);

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
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("AI filter request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function systemPrompt(): string {
  return [
    "You filter arXiv papers for a personal research inbox.",
    "Return only a JSON array. Do not include markdown.",
    "Each item must be {\"sourceId\": string, \"matched\": boolean, \"score\": number}.",
    "matched means the paper is strongly relevant to the user's current research interests based on title, abstract, and categories.",
    "score must be between 0 and 1. Use score >= 0.65 only for strong matches.",
    "Always include text/code/math LLM reasoning, coding reasoning, mathematical reasoning, formal reasoning, algorithmic reasoning, test-time scaling, search, planning, verification, self-correction, LLM post-training, SFT, RLHF, DPO, RLAIF, RLVR, reward models, process rewards, verifiable rewards, Agentic RL, LLM agents, tool use, memory, planner-executor systems, reflection, multi-agent collaboration, and LLM decision-making.",
    "Exclude all multimodal and vision-language work, including VLMs, multimodal LLMs, image/video-language reasoning, visual agents, GUI agents based on screenshots, embodied VLM agents, multimodal tool use, visual planning, image/video understanding, and image/video generation.",
    "Exclude embodied AI, robotics, navigation, manipulation, autonomous driving, physical control, and sensorimotor decision-making.",
    "Exclude traditional reinforcement learning, traditional planning, control theory, operations research, bandits, MDP/POMDP algorithms, or decision-making methods unless the central method or subject is clearly a language model or language-model agent.",
    "Exclude pure computer vision, medical imaging, remote sensing, sensors, time-series forecasting, recommendation systems, graph learning, distributed optimization, and generic machine learning unless directly focused on text/code/math LLM reasoning or LLM agents.",
    "Exclude jailbreak, red-teaming, toxicity, bias, privacy, watermarking, content moderation, safety benchmarks, misuse monitoring, policy compliance, and general LLM safety unless the core contribution directly supports post-training, reward modeling, reasoning alignment, agent alignment, or decision-making capability."
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
      matched: result.matched && result.score >= MATCH_SCORE_THRESHOLD,
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
