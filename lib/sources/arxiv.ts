import type { PaperInput } from "@/lib/papers/types";
import type { PaperSourceFetchOptions } from "@/lib/sources/types";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";
const ARXIV_OAI_URL = "https://export.arxiv.org/oai2";
const ARXIV_LIST_URL = "https://arxiv.org/list";
const ARXIV_REQUEST_DELAY_MS = 15000;
const ARXIV_TRANSIENT_BACKOFF_MS = 30000;
const ARXIV_RATE_LIMIT_BACKOFF_MS = 60000;
const ARXIV_RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const ARXIV_REQUEST_TIMEOUT_MS = 75000;
const ARXIV_MAX_RETRIES = 3;
const ARXIV_PAGE_SIZE = 50;
const DEFAULT_ARXIV_MAX_RESULTS = 200;
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

type FetchLike = typeof fetch;
export type ArxivFetchStrategy = "auto" | "api" | "list" | "oai";
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
  getLastRequestAt?: () => number | null | Promise<number | null>;
  setLastRequestAt?: (value: number) => void | Promise<void>;
  getCooldownUntil?: () => number | null | Promise<number | null>;
  setCooldownUntil?: (until: number) => void | Promise<void>;
  getCachedPaper?: (sourceId: string) => PaperInput | null | Promise<PaperInput | null>;
  setCachedPapers?: (papers: PaperInput[]) => void | Promise<void>;
  onEvent?: (event: ArxivFetchEvent) => void | Promise<void>;
};

let lastArxivRequestAt: number | null = null;
let arxivRequestQueue: Promise<void> = Promise.resolve();
let arxivCooldownUntil: number | null = null;

export class ArxivCooldownError extends Error {
  constructor(public readonly until: number) {
    super(`arXiv is cooling down after rate limiting until ${new Date(until).toISOString()}.`);
    this.name = "ArxivCooldownError";
  }
}

export function isArxivCooldownError(error: unknown): error is ArxivCooldownError {
  return error instanceof ArxivCooldownError || (
    error instanceof Error &&
    error.name === "ArxivCooldownError" &&
    error.message.includes("arXiv is cooling down after rate limiting")
  );
}

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

export function buildArxivOaiUrl(input: { category: string; dateFrom: string; dateTo: string; resumptionToken?: string }): URL {
  const url = new URL(ARXIV_OAI_URL);
  url.searchParams.set("verb", "ListRecords");
  if (input.resumptionToken) {
    url.searchParams.set("resumptionToken", input.resumptionToken);
    return url;
  }
  url.searchParams.set("from", input.dateFrom);
  url.searchParams.set("until", input.dateTo);
  url.searchParams.set("metadataPrefix", "arXiv");
  const set = toOaiSet(input.category);
  if (set) url.searchParams.set("set", set);
  return url;
}

export function buildArxivListUrl(category: string): URL {
  const safeCategory = category.replace(/[^A-Za-z0-9._-]/g, "");
  return new URL(`${ARXIV_LIST_URL}/${safeCategory}/new`);
}

export function buildArxivAbsUrl(id: string): URL {
  return new URL(`https://arxiv.org/abs/${normalizeArxivId(id)}`);
}

export async function fetchArxivPapers(options: PaperSourceFetchOptions, runtime: ArxivFetchRuntime = {}): Promise<PaperInput[]> {
  if (runtime.strategy === "api") {
    return fetchArxivPapersFromApiSearch(options, runtime);
  }
  if (runtime.strategy === "list") {
    return fetchArxivPapersFromLists(options, runtime);
  }
  if (runtime.strategy === "oai" || runtime.strategy === "auto" || !runtime.strategy) {
    const papers = await fetchArxivPapersFromOai(options, runtime);
    if (papers.length || !shouldUseListFetch(options, { ...runtime, strategy: "list" })) {
      return papers;
    }
    await emitArxivEvent(runtime, {
      message: "OAI-PMH returned no papers; falling back to arXiv list pages.",
      details: {
        strategy: "list_fallback"
      }
    });
    return fetchArxivPapersFromLists(options, runtime);
  }
  if (shouldUseListFetch(options, runtime)) {
    return fetchArxivPapersFromLists(options, runtime);
  }
  return fetchArxivPapersFromApiSearch(options, runtime);
}

async function fetchArxivPapersFromOai(options: PaperSourceFetchOptions, runtime: ArxivFetchRuntime): Promise<PaperInput[]> {
  const maxResults = options.maxResults ?? DEFAULT_ARXIV_MAX_RESULTS;
  const papers: PaperInput[] = [];
  await emitArxivEvent(runtime, {
    message: "Using arXiv OAI-PMH date-range metadata fetch.",
    details: {
      strategy: "oai",
      categories: options.categories,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      maxResults
    }
  });

  for (const category of options.categories.length ? options.categories : ["all"]) {
    let url: URL | null = buildArxivOaiUrl({ category, dateFrom: options.dateFrom, dateTo: options.dateTo });
    while (url) {
      const response = await fetchArxivWithRetries(url, runtime);
      if (!response.ok) {
        throw new Error(`arXiv OAI-PMH request failed with ${response.status}`);
      }
      const parsed = parseArxivOaiFeed(await response.text());
      papers.push(...parsed.papers);
      await runtime.setCachedPapers?.(parsed.papers);
      await emitArxivEvent(runtime, {
        message: "Fetched arXiv OAI-PMH metadata.",
        details: {
          category,
          count: parsed.papers.length,
          hasResumptionToken: Boolean(parsed.resumptionToken)
        }
      });
      if (papers.length >= maxResults) {
        await emitArxivEvent(runtime, {
          message: "Reached requested arXiv OAI-PMH result limit.",
          details: {
            count: papers.length,
            maxResults
          }
        });
        break;
      }
      url = parsed.resumptionToken
        ? buildArxivOaiUrl({ category, dateFrom: options.dateFrom, dateTo: options.dateTo, resumptionToken: parsed.resumptionToken })
        : null;
    }
  }

  return dedupePapersBySourceId(papers)
    .filter((paper) => isPaperInDateRange(paper, options))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, maxResults);
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
  const fetchedPapers: PaperInput[] = [];
  for (const id of uniqueIds) {
    const cached = await runtime.getCachedPaper?.(id);
    if (cached) {
      papers.push(cached);
      await emitArxivEvent(runtime, {
        message: "Using cached arXiv paper metadata.",
        details: {
          sourceId: id
        }
      });
      continue;
    }
    const response = await fetchArxivWithRetries(buildArxivAbsUrl(id), runtime);
    if (!response.ok) {
      throw new Error(`arXiv abstract page request failed with ${response.status}`);
    }
    const paper = parseArxivAbsPage(id, await response.text());
    papers.push(paper);
    fetchedPapers.push(paper);
    await emitArxivEvent(runtime, {
      message: "Fetched arXiv abstract-page metadata.",
      details: {
        sourceId: id
      }
    });
  }
  await runtime.setCachedPapers?.(fetchedPapers);

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

export function parseArxivAbsPage(sourceId: string, html: string): PaperInput {
  const normalizedSourceId = normalizeArxivId(sourceId);
  const title = cleanHtmlText(extractFirstHtmlBlock(html, "h1", "title")).replace(/^Title:\s*/i, "");
  const abstract = cleanHtmlText(extractFirstHtmlBlock(html, "blockquote", "abstract")).replace(/^Abstract:\s*/i, "");
  const authorsBlock = extractFirstHtmlBlock(html, "div", "authors");
  const authors = extractHtmlLinksText(authorsBlock);
  const subjectText = cleanHtmlText(extractFirstHtmlBlock(html, "td", "subjects"));
  const categories = [...subjectText.matchAll(/[a-z]+(?:-[a-z]+)?\.[A-Z]{2}/g)].map((match) => match[0]);
  const publishedAt = parseArxivSubmittedDate(cleanHtmlText(extractFirstHtmlBlock(html, "div", "dateline")));

  return {
    source: "arxiv",
    sourceId: normalizedSourceId,
    title,
    abstract,
    authors,
    categories,
    primaryCategory: categories[0] ?? "",
    publishedAt,
    updatedAt: publishedAt,
    sourceUrl: `https://arxiv.org/abs/${normalizedSourceId}`,
    pdfUrl: `https://arxiv.org/pdf/${normalizedSourceId}`
  };
}

export function parseArxivOaiFeed(xml: string): { papers: PaperInput[]; resumptionToken: string | null } {
  const papers = extractBlocks(xml, "record")
    .map((record) => extractBlocks(record, "arXiv")[0] ?? "")
    .filter(Boolean)
    .map(parseArxivOaiRecord)
    .filter((paper): paper is PaperInput => paper !== null);
  const token = normalizeWhitespace(extractTag(xml, "resumptionToken"));
  return {
    papers,
    resumptionToken: token || null
  };
}

function parseArxivOaiRecord(record: string): PaperInput | null {
  const sourceId = normalizeArxivId(extractTag(record, "id"));
  if (!sourceId) return null;
  const created = normalizeWhitespace(extractTag(record, "created"));
  const updated = normalizeWhitespace(extractTag(record, "updated")) || created;
  const categories = normalizeWhitespace(extractTag(record, "categories")).split(/\s+/).filter(Boolean);
  return {
    source: "arxiv",
    sourceId,
    title: normalizeWhitespace(extractTag(record, "title")),
    abstract: normalizeWhitespace(extractTag(record, "abstract")),
    authors: extractBlocks(record, "author").map(parseOaiAuthor).filter(Boolean),
    categories,
    primaryCategory: categories[0] ?? "",
    publishedAt: toIsoDateOnly(created),
    updatedAt: toIsoDateOnly(updated),
    sourceUrl: `https://arxiv.org/abs/${sourceId}`,
    pdfUrl: `https://arxiv.org/pdf/${sourceId}`
  };
}

function toArxivDate(date: string, time: string): string {
  return `${date.replaceAll("-", "")}${time}`;
}

function toOaiSet(category: string): string {
  if (category === "all") return "";
  const normalized = category.trim();
  const [base, subcategory] = normalized.includes(".")
    ? normalized.split(".", 2)
    : normalized.split(":", 2);
  if (!subcategory) return `${base}:${base}`;
  return `${base}:${base}:${subcategory}`;
}

function toIsoDate(value: string): string {
  return new Date(normalizeWhitespace(value)).toISOString();
}

function toIsoDateOnly(value: string): string {
  if (!value) return new Date(0).toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00.000Z`).toISOString();
  return toIsoDate(value);
}

function normalizeArxivId(value: string): string {
  const lastSegment = value.split("/").filter(Boolean).at(-1) ?? value;
  return lastSegment.replace(/v\d+$/i, "");
}

function extractFirstHtmlBlock(html: string, tagName: string, className: string): string {
  const pattern = new RegExp(`<${tagName}\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  return html.match(pattern)?.[1] ?? "";
}

function extractHtmlLinksText(html: string): string[] {
  const links = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => cleanHtmlText(match[1]))
    .filter(Boolean);
  if (links.length) return links;
  return cleanHtmlText(html).replace(/^Authors?:\s*/i, "").split(",").map((author) => author.trim()).filter(Boolean);
}

function parseOaiAuthor(author: string): string {
  const keyname = normalizeWhitespace(extractTag(author, "keyname"));
  const forenames = normalizeWhitespace(extractTag(author, "forenames"));
  return [forenames, keyname].filter(Boolean).join(" ").trim();
}

function cleanHtmlText(value: string): string {
  return normalizeWhitespace(value.replace(/<[^>]+>/g, " "));
}

function parseArxivSubmittedDate(value: string): string {
  const match = value.match(/Submitted on\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/i);
  if (!match) return new Date(0).toISOString();
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(match[2].toLowerCase());
  if (month < 0) return new Date(0).toISOString();
  return new Date(Date.UTC(Number(match[3]), month, Number(match[1]))).toISOString();
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
    .replaceAll("&nbsp;", " ")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

async function fetchArxivWithRetries(url: URL, runtime: ArxivFetchRuntime): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastError: Error | null = null;
  await assertArxivCooldownInactive(runtime);

  for (let attempt = 0; attempt <= ARXIV_MAX_RETRIES; attempt += 1) {
    try {
      const response = await runArxivRequestWithRateLimit(() => requestArxiv(url, runtime), runtime);
      if (response.status === 429) {
        const until = await activateArxivCooldown(runtime);
        throw new ArxivCooldownError(until);
      }
      if (response.ok || !TRANSIENT_STATUS_CODES.has(response.status) || attempt === ARXIV_MAX_RETRIES) {
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
  const persistedLastRequestAt = await runtime.getLastRequestAt?.();
  const referenceRequestAt = Math.max(lastArxivRequestAt ?? 0, persistedLastRequestAt ?? 0);

  if (referenceRequestAt > 0) {
    const waitMs = referenceRequestAt + ARXIV_REQUEST_DELAY_MS - currentTime;
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }

  lastArxivRequestAt = now();
  await runtime.setLastRequestAt?.(lastArxivRequestAt);
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

async function assertArxivCooldownInactive(runtime: ArxivFetchRuntime): Promise<void> {
  const now = (runtime.now ?? Date.now)();
  const persistedCooldownUntil = await runtime.getCooldownUntil?.();
  const activeCooldownUntil = Math.max(arxivCooldownUntil ?? 0, persistedCooldownUntil ?? 0);
  if (activeCooldownUntil > now) {
    await emitArxivEvent(runtime, {
      level: "error",
      message: "arXiv rate limit cooldown is active.",
      details: {
        cooldownUntil: new Date(activeCooldownUntil).toISOString()
      }
    });
    throw new ArxivCooldownError(activeCooldownUntil);
  }
  if (arxivCooldownUntil !== null && arxivCooldownUntil <= now) {
    arxivCooldownUntil = null;
  }
}

async function activateArxivCooldown(runtime: ArxivFetchRuntime): Promise<number> {
  arxivCooldownUntil = (runtime.now ?? Date.now)() + ARXIV_RATE_LIMIT_COOLDOWN_MS;
  await runtime.setCooldownUntil?.(arxivCooldownUntil);
  await emitArxivEvent(runtime, {
    level: "error",
    message: "arXiv rate limit cooldown activated.",
    details: {
      cooldownUntil: new Date(arxivCooldownUntil).toISOString(),
      cooldownMs: ARXIV_RATE_LIMIT_COOLDOWN_MS
    }
  });
  return arxivCooldownUntil;
}

function describeArxivUrl(url: URL): string {
  if (url.hostname === "export.arxiv.org") {
    if (url.pathname === "/oai2") {
      const token = url.searchParams.get("resumptionToken");
      if (token) return `${url.origin}${url.pathname}?verb=ListRecords&resumptionToken=<omitted>`;
      return `${url.origin}${url.pathname}?verb=${url.searchParams.get("verb") ?? ""}&metadataPrefix=${url.searchParams.get("metadataPrefix") ?? ""}&set=${url.searchParams.get("set") ?? ""}&from=${url.searchParams.get("from") ?? ""}&until=${url.searchParams.get("until") ?? ""}`;
    }
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
