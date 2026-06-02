import type { AiConnectionConfig } from "@/lib/ai/client";
import { getAiConnectionConfigFromEnv } from "@/lib/ai/client";
import type { Paper, PaperPdfAnalysisResult } from "@/lib/papers/types";

type FetchLike = typeof fetch;

const PDF_ANALYSIS_TIMEOUT_MS = 180_000;
const PDF_TEXT_INPUT_LIMIT = 120_000;

export async function analyzePdfTextWithLlm(
  paper: Paper,
  pdfText: string,
  options: {
    config?: AiConnectionConfig;
    fetcher?: FetchLike;
  } = {}
): Promise<PaperPdfAnalysisResult> {
  const config = options.config ?? getAiConnectionConfigFromEnv();
  const baseUrl = config.baseUrl.trim();
  const model = config.model.trim();
  const apiKey = config.apiKey.trim();

  if (!baseUrl || !model || !apiKey) {
    throw new Error("AI_BASE_URL, AI_MODEL, and AI_API_KEY must all be configured before analyzing PDF text.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PDF_ANALYSIS_TIMEOUT_MS);

  try {
    const response = await (options.fetcher ?? fetch)(`${baseUrl.replace(/\/+$/, "")}/responses`, {
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
            content: [{ type: "input_text", text: userPrompt(paper, pdfText) }]
          }
        ],
        max_output_tokens: 3600,
        stream: true
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`AI PDF analysis request failed with ${response.status}. ${sanitizeProviderError(body, apiKey)}`);
    }

    return normalizePdfAnalysis(parseAnalysisJson(await readStreamingText(response)), model);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("AI PDF analysis request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function systemPrompt(): string {
  return [
    "You write detailed Chinese reading notes for one arXiv paper from its extracted PDF text.",
    "Return only JSON. Do not include markdown.",
    "The JSON must be {\"overviewZh\": string, \"backgroundZh\": string, \"problemFormulationZh\": string, \"methodZh\": string, \"keyIdeasZh\": string, \"experimentsZh\": string, \"limitationsZh\": string, \"readingGuideZh\": string, \"affiliations\": string}.",
    "overviewZh should be 2-3 Chinese sentences explaining what the paper is about and why it matters.",
    "backgroundZh should explain the research context and prerequisite ideas.",
    "problemFormulationZh should describe the actual problem, setup, objective, variables, or evaluation target. If the paper is not formal, explain its implicit formulation.",
    "methodZh should describe the algorithm, training recipe, architecture, agent design, or reasoning procedure in enough detail for a researcher to follow.",
    "keyIdeasZh should identify the 3-5 central ideas, mechanisms, or design choices.",
    "experimentsZh should summarize datasets, baselines, metrics, main results, and important ablations when available.",
    "limitationsZh should state limitations, assumptions, missing evidence, and risks.",
    "readingGuideZh should tell the user which sections, equations, tables, or figures to read first and what questions to check while reading.",
    "affiliations should list author institutions or labs found in the PDF. If not identifiable, output \"未识别\".",
    "Be faithful to the PDF text. If a detail is not in the text, say it is not clear rather than inventing it."
  ].join("\n");
}

function userPrompt(paper: Paper, pdfText: string): string {
  return JSON.stringify({
    title: paper.title,
    abstract: paper.abstract,
    authors: paper.authors,
    categories: paper.categories,
    primaryCategory: paper.primaryCategory,
    pdfText: pdfText.slice(0, PDF_TEXT_INPUT_LIMIT)
  });
}

function parseAnalysisJson(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI PDF analysis returned non-object JSON.");
  }
  return parsed as Record<string, unknown>;
}

function normalizePdfAnalysis(raw: Record<string, unknown>, model: string): PaperPdfAnalysisResult {
  return {
    overviewZh: requireString(raw.overviewZh, "overviewZh"),
    backgroundZh: requireString(raw.backgroundZh, "backgroundZh"),
    problemFormulationZh: requireString(raw.problemFormulationZh, "problemFormulationZh"),
    methodZh: requireString(raw.methodZh, "methodZh"),
    keyIdeasZh: requireString(raw.keyIdeasZh, "keyIdeasZh"),
    experimentsZh: requireString(raw.experimentsZh, "experimentsZh"),
    limitationsZh: requireString(raw.limitationsZh, "limitationsZh"),
    readingGuideZh: requireString(raw.readingGuideZh, "readingGuideZh"),
    affiliations: requireString(raw.affiliations, "affiliations"),
    model,
    checkedAt: new Date().toISOString(),
    error: null
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`AI PDF analysis returned invalid ${field}.`);
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
