import type { PaperInput } from "@/lib/papers/types";
import type { PaperSourceFetchOptions } from "@/lib/sources/types";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";
const ARXIV_REQUEST_DELAY_MS = 3000;
const ARXIV_MAX_RETRIES = 2;
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

type FetchLike = typeof fetch;
type ArxivFetchRuntime = {
  fetcher?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

let lastArxivRequestAt: number | null = null;
let arxivRequestQueue: Promise<void> = Promise.resolve();

export function buildArxivQueryUrl(options: PaperSourceFetchOptions): URL {
  const url = new URL(ARXIV_API_URL);
  const categoryQuery = options.categories.length
    ? `(${options.categories.map((category) => `cat:${category}`).join(" OR ")})`
    : "all:*";
  const dateQuery = `submittedDate:[${toArxivDate(options.dateFrom, "0000")} TO ${toArxivDate(options.dateTo, "2359")}]`;
  url.searchParams.set("search_query", `${categoryQuery} AND ${dateQuery}`);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(options.maxResults ?? 100));
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");
  return url;
}

export async function fetchArxivPapers(options: PaperSourceFetchOptions, runtime: ArxivFetchRuntime = {}): Promise<PaperInput[]> {
  const response = await fetchArxivWithRetries(buildArxivQueryUrl(options), runtime);

  if (!response.ok) {
    throw new Error(`arXiv request failed with ${response.status}`);
  }

  return parseArxivFeed(await response.text());
}

export function resetArxivRateLimitForTests(): void {
  lastArxivRequestAt = null;
  arxivRequestQueue = Promise.resolve();
}

export function parseArxivFeed(xml: string): PaperInput[] {
  return extractBlocks(xml, "entry").map((entry) => {
    const rawId = normalizeWhitespace(extractTag(entry, "id"));
    const sourceId = normalizeArxivId(rawId);
    const categories = extractCategoryTerms(entry);
    const primaryCategory = extractPrimaryCategory(entry) ?? categories[0] ?? "";
    return {
      source: "arxiv",
      sourceId,
      title: normalizeWhitespace(extractTag(entry, "title")),
      abstract: normalizeWhitespace(extractTag(entry, "summary")),
      authors: extractBlocks(entry, "author").map((author) => normalizeWhitespace(extractTag(author, "name"))).filter(Boolean),
      categories,
      primaryCategory,
      publishedAt: toIsoDate(extractTag(entry, "published")),
      updatedAt: toIsoDate(extractTag(entry, "updated")),
      sourceUrl: `https://arxiv.org/abs/${sourceId}`,
      pdfUrl: `https://arxiv.org/pdf/${sourceId}`
    };
  });
}

function toArxivDate(date: string, time: string): string {
  return `${date.replaceAll("-", "")}${time}`;
}

function toIsoDate(value: string): string {
  return new Date(normalizeWhitespace(value)).toISOString();
}

function normalizeArxivId(value: string): string {
  const lastSegment = value.split("/").filter(Boolean).at(-1) ?? value;
  return lastSegment.replace(/v\d+$/i, "");
}

function extractBlocks(xml: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  return [...xml.matchAll(pattern)].map((match) => match[1]);
}

function extractTag(xml: string, tagName: string): string {
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1] ? decodeXml(match[1]) : "";
}

function extractCategoryTerms(xml: string): string[] {
  return [...xml.matchAll(/<category\b[^>]*\bterm=["']([^"']+)["'][^>]*\/?>/gi)].map((match) => decodeXml(match[1]));
}

function extractPrimaryCategory(xml: string): string | null {
  const match = xml.match(/<arxiv:primary_category\b[^>]*\bterm=["']([^"']+)["'][^>]*\/?>/i);
  return match?.[1] ? decodeXml(match[1]) : null;
}

function normalizeWhitespace(value: string): string {
  return decodeXml(value).replace(/\s+/g, " ").trim();
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

async function fetchArxivWithRetries(url: URL, runtime: ArxivFetchRuntime): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= ARXIV_MAX_RETRIES; attempt += 1) {
    const response = await runArxivRequestWithRateLimit(() => requestArxiv(url, runtime), runtime);
    if (response.ok || !TRANSIENT_STATUS_CODES.has(response.status) || attempt === ARXIV_MAX_RETRIES) {
      return response;
    }
    lastResponse = response;
  }

  return lastResponse ?? requestArxiv(url, runtime);
}

async function runArxivRequestWithRateLimit<T>(operation: () => Promise<T>, runtime: ArxivFetchRuntime): Promise<T> {
  const previous = arxivRequestQueue;
  let release: () => void = () => {};
  arxivRequestQueue = new Promise((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    await waitForArxivRequestSlot(runtime);
    return await operation();
  } finally {
    release();
  }
}

async function waitForArxivRequestSlot(runtime: ArxivFetchRuntime): Promise<void> {
  const now = runtime.now ?? Date.now;
  const sleep = runtime.sleep ?? defaultSleep;
  const currentTime = now();

  if (lastArxivRequestAt !== null) {
    const waitMs = lastArxivRequestAt + ARXIV_REQUEST_DELAY_MS - currentTime;
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }

  lastArxivRequestAt = now();
}

function requestArxiv(url: URL, runtime: ArxivFetchRuntime): Promise<Response> {
  const fetcher = runtime.fetcher ?? fetch;
  return fetcher(url, {
    headers: {
      "User-Agent": "ScholarInbox/0.1 (personal research paper inbox; https://github.com/Dracoqhl/ScholarInbox)"
    }
  });
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
