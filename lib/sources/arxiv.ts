import type { PaperInput } from "@/lib/papers/types";
import type { PaperSourceFetchOptions } from "@/lib/sources/types";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";
const ARXIV_LIST_URL = "https://arxiv.org/list";
const ARXIV_REQUEST_DELAY_MS = 3000;
const ARXIV_TRANSIENT_BACKOFF_MS = 30000;
const ARXIV_RATE_LIMIT_BACKOFF_MS = 60000;
const ARXIV_RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const ARXIV_REQUEST_TIMEOUT_MS = 75000;
const ARXIV_MAX_RETRIES = 3;
const ARXIV_PAGE_SIZE = 50;
const ARXIV_ID_LIST_PAGE_SIZE = 50;
const DEFAULT_ARXIV_MAX_RESULTS = 200;
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

type FetchLike = typeof fetch;
export type ArxivFetchStrategy = "auto" | "api" | "list";
export type ArxivFetchEvent = {
  level?: "info" | "error";
  message: string;
  details?: Record<string, unknown>;
};
type ArxivFetchRuntime = {
  fetcher?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  pageSize?: number;
  requestTimeoutMs?: number;
  strategy?: ArxivFetchStrategy;
  onEvent?: (event: ArxivFetchEvent) => void | Promise<void>;
};

let lastArxivRequestAt: number | null = null;
let arxivRequestQueue: Promise<void> = Promise.resolve();
let arxivCooldownUntil: number | null = null;

export function buildArxivQueryUrl(options: PaperSourceFetchOptions, start = 0): URL {
  const url = new URL(ARXIV_API_URL);
  const categoryQuery = options.categories.length
    ? `(${options.categories.map((category) => `cat:${category}`).join(" OR ")})`
    : "all:*";
  const dateQuery = `submittedDate:[${toArxivDate(options.dateFrom, "0000")} TO ${toArxivDate(options.dateTo, "2359")}]`;
  url.searchParams.set("search_query", `${categoryQuery} AND ${dateQuery}`);
  url.searchParams.set("start", String(start));
  url.searchParams.set("max_results", String(options.maxResults ?? DEFAULT_ARXIV_MAX_RESULTS));
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");
  return url;
}

export function buildArxivIdListQueryUrl(ids: string[]): URL {
  const url = new URL(ARXIV_API_URL);
  url.searchParams.set("id_list", ids.join(","));
  url.searchParams.set("max_results", String(ids.length));
  return url;
}

export function buildArxivListUrl(category: string): URL {
  const safeCategory = category.replace(/[^A-Za-z0-9._-]/g, "");
  const url = new URL(`${ARXIV_LIST_URL}/${safeCategory}/pastweek`);
  url.searchParams.set("show", "200");
  return url;
}

export async function fetchArxivPapers(options: PaperSourceFetchOptions, runtime: ArxivFetchRuntime = {}): Promise<PaperInput[]> {
  if (shouldUseListFetch(options, runtime)) {
    return fetchArxivPapersFromLists(options, runtime);
  }
  return fetchArxivPapersFromApiSearch(options, runtime);
}

async function fetchArxivPapersFromApiSearch(options: PaperSourceFetchOptions, runtime: ArxivFetchRuntime): Promise<PaperInput[]> {
  const maxResults = options.maxResults ?? DEFAULT_ARXIV_MAX_RESULTS;
  const pageSize = Math.max(1, Math.min(runtime.pageSize ?? ARXIV_PAGE_SIZE, maxResults));
  const papers: PaperInput[] = [];
  await emitArxivEvent(runtime, {
    message: "Using arXiv API submitted-date search.",
    details: {
      strategy: "api",
      maxResults,
      pageSize
    }
  });

  for (let start = 0; start < maxResults; start += pageSize) {
    const currentPageSize = Math.min(pageSize, maxResults - start);
    const response = await fetchArxivWithRetries(buildArxivQueryUrl({ ...options, maxResults: currentPageSize }, start), runtime);

    if (!response.ok) {
      throw new Error(`arXiv request failed with ${response.status}`);
    }

    const pagePapers = parseArxivFeed(await response.text());
    papers.push(...pagePapers);
    if (pagePapers.length < currentPageSize) break;
  }

  return dedupePapersBySourceId(papers).slice(0, maxResults);
}

async function fetchArxivPapersFromLists(options: PaperSourceFetchOptions, runtime: ArxivFetchRuntime): Promise<PaperInput[]> {
  const maxResults = options.maxResults ?? DEFAULT_ARXIV_MAX_RESULTS;
  await emitArxivEvent(runtime, {
    message: "Using arXiv list-page candidate fetch.",
    details: {
      strategy: "list",
      categories: options.categories,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      maxResults
    }
  });

  const candidateIds: string[] = [];
  for (const category of options.categories) {
    const response = await fetchArxivWithRetries(buildArxivListUrl(category), runtime);
    if (!response.ok) {
      throw new Error(`arXiv list request failed with ${response.status}`);
    }
    const ids = parseArxivListIds(await response.text());
    candidateIds.push(...ids);
    await emitArxivEvent(runtime, {
      message: "Fetched arXiv list-page candidates.",
      details: {
        category,
        candidateCount: ids.length
      }
    });
  }

  const uniqueIds = [...new Set(candidateIds)].slice(0, Math.max(maxResults, Math.min(200, maxResults * 2)));
  if (!uniqueIds.length) return [];

  const papers: PaperInput[] = [];
  for (let index = 0; index < uniqueIds.length; index += ARXIV_ID_LIST_PAGE_SIZE) {
    const ids = uniqueIds.slice(index, index + ARXIV_ID_LIST_PAGE_SIZE);
    const response = await fetchArxivWithRetries(buildArxivIdListQueryUrl(ids), runtime);
    if (!response.ok) {
      throw new Error(`arXiv metadata request failed with ${response.status}`);
    }
    papers.push(...parseArxivFeed(await response.text()));
  }

  return dedupePapersBySourceId(papers)
    .filter((paper) => isPaperInDateRange(paper, options))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, maxResults);
}

export function resetArxivRateLimitForTests(): void {
  lastArxivRequestAt = null;
  arxivRequestQueue = Promise.resolve();
  arxivCooldownUntil = null;
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

export function parseArxivListIds(html: string): string[] {
  const ids = [...html.matchAll(/href=["'](?:https?:\/\/arxiv\.org)?\/abs\/([^"'?#]+)["']/gi)]
    .map((match) => normalizeArxivId(match[1]))
    .filter(Boolean);
  return [...new Set(ids)];
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
  let lastError: Error | null = null;
  assertArxivCooldownInactive(runtime);

  for (let attempt = 0; attempt <= ARXIV_MAX_RETRIES; attempt += 1) {
    try {
      const response = await runArxivRequestWithRateLimit(() => requestArxiv(url, runtime), runtime);
      if (response.ok || !TRANSIENT_STATUS_CODES.has(response.status) || attempt === ARXIV_MAX_RETRIES) {
        if (response.status === 429) {
          await activateArxivCooldown(runtime);
        }
        return response;
      }
      lastResponse = response;
      await emitArxivEvent(runtime, {
        message: "arXiv request returned a transient status; backing off before retry.",
        details: {
          status: response.status,
          attempt: attempt + 1,
          maxAttempts: ARXIV_MAX_RETRIES + 1,
          url: describeArxivUrl(url)
        }
      });
      await waitForRetryBackoff(response.status, attempt, runtime);
      continue;
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error(String(error));
      if (!isRetryableArxivError(nextError) || attempt === ARXIV_MAX_RETRIES) {
        throw nextError;
      }
      lastError = nextError;
      await emitArxivEvent(runtime, {
        message: "arXiv request failed transiently; backing off before retry.",
        details: {
          error: nextError.message,
          attempt: attempt + 1,
          maxAttempts: ARXIV_MAX_RETRIES + 1,
          url: describeArxivUrl(url)
        }
      });
      await waitForRetryBackoff(null, attempt, runtime);
    }
  }

  if (lastError) throw lastError;
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

async function requestArxiv(url: URL, runtime: ArxivFetchRuntime): Promise<Response> {
  const fetcher = runtime.fetcher ?? fetch;
  const controller = new AbortController();
  const requestTimeoutMs = runtime.requestTimeoutMs ?? ARXIV_REQUEST_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    await emitArxivEvent(runtime, {
      message: "Requesting arXiv.",
      details: {
        url: describeArxivUrl(url)
      }
    });
    return await fetcher(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ScholarInbox/0.1 (personal research paper inbox; https://github.com/Dracoqhl/ScholarInbox)"
      }
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`arXiv request timed out after ${requestTimeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRetryBackoff(status: number | null, attempt: number, runtime: ArxivFetchRuntime): Promise<void> {
  const sleep = runtime.sleep ?? defaultSleep;
  const baseBackoff = status === 429 ? ARXIV_RATE_LIMIT_BACKOFF_MS : ARXIV_TRANSIENT_BACKOFF_MS;
  await sleep(baseBackoff * (attempt + 1));
  if (status === 429) {
    lastArxivRequestAt = null;
  }
}

function shouldUseListFetch(options: PaperSourceFetchOptions, runtime: ArxivFetchRuntime): boolean {
  if (runtime.strategy === "api") return false;
  if (runtime.strategy === "list") return true;
  if (!options.categories.length) return false;
  const dateFrom = parseDateInput(options.dateFrom);
  const dateTo = parseDateInput(options.dateTo);
  if (!dateFrom || !dateTo) return false;
  const rangeDays = Math.floor((dateTo.getTime() - dateFrom.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (rangeDays < 1 || rangeDays > 7) return false;
  const now = new Date((runtime.now ?? Date.now)());
  const oldestRecentDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 8));
  return dateTo >= oldestRecentDate;
}

function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function isPaperInDateRange(paper: PaperInput, options: PaperSourceFetchOptions): boolean {
  const publishedDate = paper.publishedAt.slice(0, 10);
  return publishedDate >= options.dateFrom && publishedDate <= options.dateTo;
}

function assertArxivCooldownInactive(runtime: ArxivFetchRuntime): void {
  const now = (runtime.now ?? Date.now)();
  if (arxivCooldownUntil !== null && arxivCooldownUntil > now) {
    throw new Error(`arXiv is cooling down after rate limiting until ${new Date(arxivCooldownUntil).toISOString()}.`);
  }
  if (arxivCooldownUntil !== null && arxivCooldownUntil <= now) {
    arxivCooldownUntil = null;
  }
}

async function activateArxivCooldown(runtime: ArxivFetchRuntime): Promise<void> {
  arxivCooldownUntil = (runtime.now ?? Date.now)() + ARXIV_RATE_LIMIT_COOLDOWN_MS;
  await emitArxivEvent(runtime, {
    level: "error",
    message: "arXiv rate limit cooldown activated.",
    details: {
      cooldownUntil: new Date(arxivCooldownUntil).toISOString(),
      cooldownMs: ARXIV_RATE_LIMIT_COOLDOWN_MS
    }
  });
}

function describeArxivUrl(url: URL): string {
  if (url.hostname === "export.arxiv.org") {
    const start = url.searchParams.get("start");
    const maxResults = url.searchParams.get("max_results");
    const idList = url.searchParams.get("id_list");
    return idList
      ? `${url.origin}${url.pathname}?id_list=<${idList.split(",").length} ids>&max_results=${maxResults ?? ""}`
      : `${url.origin}${url.pathname}?search_query=<omitted>&start=${start ?? ""}&max_results=${maxResults ?? ""}`;
  }
  return url.toString();
}

async function emitArxivEvent(runtime: ArxivFetchRuntime, event: ArxivFetchEvent): Promise<void> {
  await runtime.onEvent?.({
    level: event.level ?? "info",
    message: event.message,
    ...(event.details ? { details: event.details } : {})
  });
}

function isRetryableArxivError(error: Error): boolean {
  return error.message.toLowerCase().includes("timed out");
}

function dedupePapersBySourceId(papers: PaperInput[]): PaperInput[] {
  const seen = new Set<string>();
  const unique: PaperInput[] = [];
  for (const paper of papers) {
    if (seen.has(paper.sourceId)) continue;
    seen.add(paper.sourceId);
    unique.push(paper);
  }
  return unique;
}
