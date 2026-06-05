import type { PaperInput } from "@/lib/papers/types";
import type { TopicSearchCandidate, TopicCanonicalPlatform } from "@/lib/topic-search/types";

const SEMANTIC_SCHOLAR_SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search";
const SEMANTIC_SCHOLAR_FIELDS = [
  "paperId",
  "corpusId",
  "title",
  "abstract",
  "url",
  "year",
  "publicationDate",
  "authors",
  "externalIds",
  "openAccessPdf",
  "fieldsOfStudy"
].join(",");

type FetchLike = typeof fetch;

type SemanticScholarPaper = {
  paperId?: string;
  corpusId?: number | string;
  title?: string;
  abstract?: string | null;
  url?: string | null;
  year?: number | null;
  publicationDate?: string | null;
  authors?: Array<{ name?: string | null }>;
  externalIds?: Record<string, string | number | null | undefined> | null;
  openAccessPdf?: { url?: string | null } | null;
  fieldsOfStudy?: string[] | null;
};

export type SemanticScholarTopicSearchOptions = {
  querySeeds: string[];
  dateFrom: string;
  dateTo: string;
  maxResults?: number;
  fetcher?: FetchLike;
};

export async function fetchSemanticScholarTopicCandidates(options: SemanticScholarTopicSearchOptions): Promise<TopicSearchCandidate[]> {
  const fetcher = options.fetcher ?? fetch;
  const maxResults = Math.max(1, Math.min(options.maxResults ?? 50, 100));
  const candidates: TopicSearchCandidate[] = [];

  for (const querySeed of options.querySeeds) {
    if (candidates.length >= maxResults) break;
    const response = await fetcher(buildSemanticScholarUrl({ ...options, querySeed, limit: maxResults - candidates.length }));
    if (!response.ok) throw new Error(`Semantic Scholar topic search request failed with ${response.status}`);
    const payload = (await response.json()) as { data?: SemanticScholarPaper[] };
    for (const item of payload.data ?? []) {
      const candidate = toCandidate(item, querySeed);
      if (!candidate) continue;
      if (!isPaperInDateRange(candidate.paper, options)) continue;
      candidates.push(candidate);
      if (candidates.length >= maxResults) break;
    }
  }

  return candidates;
}

function buildSemanticScholarUrl(input: { querySeed: string; dateFrom: string; dateTo: string; limit: number }): URL {
  const url = new URL(SEMANTIC_SCHOLAR_SEARCH_URL);
  url.searchParams.set("query", input.querySeed);
  url.searchParams.set("limit", String(input.limit));
  url.searchParams.set("fields", SEMANTIC_SCHOLAR_FIELDS);
  url.searchParams.set("year", `${input.dateFrom.slice(0, 4)}-${input.dateTo.slice(0, 4)}`);
  return url;
}

function toCandidate(item: SemanticScholarPaper, querySeed: string): TopicSearchCandidate | null {
  if (!item.paperId || !item.title) return null;
  const externalIds = normalizeExternalIds(item);
  const arxivId = normalizeArxivId(externalIds.arxiv);
  const source = arxivId ? "arxiv" : "semantic_scholar";
  const sourceId = arxivId ?? item.paperId;
  const canonicalPlatform = getCanonicalPlatform(externalIds);
  const canonicalUrl = arxivId ? `https://arxiv.org/abs/${arxivId}` : item.url ?? "";
  const paper: PaperInput = {
    source,
    sourceId,
    title: item.title,
    abstract: item.abstract ?? "",
    authors: (item.authors ?? []).map((author) => author.name?.trim() ?? "").filter(Boolean),
    categories: item.fieldsOfStudy ?? [],
    primaryCategory: item.fieldsOfStudy?.[0] ?? "",
    publishedAt: toPublishedIso(item.publicationDate, item.year),
    updatedAt: null,
    sourceUrl: canonicalUrl || item.url || `https://www.semanticscholar.org/paper/${item.paperId}`,
    pdfUrl: item.openAccessPdf?.url ?? (arxivId ? `https://arxiv.org/pdf/${arxivId}` : item.url ?? "")
  };

  return {
    paper,
    discoveryChannel: "semantic_scholar",
    matchedQueries: [querySeed],
    canonicalPlatform,
    canonicalUrl: paper.sourceUrl,
    externalIds
  };
}

function normalizeExternalIds(item: SemanticScholarPaper): Record<string, string> {
  const raw = item.externalIds ?? {};
  const result: Record<string, string> = {
    semanticScholar: item.paperId ?? ""
  };
  if (item.corpusId !== undefined && item.corpusId !== null) result.corpusId = String(item.corpusId);
  if (raw.ArXiv) result.arxiv = normalizeArxivId(String(raw.ArXiv)) ?? String(raw.ArXiv);
  if (raw.DOI) result.doi = String(raw.DOI);
  if (raw.OpenReview) result.openreview = String(raw.OpenReview);
  return Object.fromEntries(Object.entries(result).filter(([, value]) => Boolean(value)));
}

function getCanonicalPlatform(externalIds: Record<string, string>): TopicCanonicalPlatform {
  if (externalIds.arxiv) return "arxiv";
  if (externalIds.openreview) return "openreview";
  if (externalIds.doi) return "doi";
  return "unknown";
}

function normalizeArxivId(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(/(?:arxiv:|abs\/)?(\d{4}\.\d{4,5})(?:v\d+)?/i);
  return match?.[1] ?? null;
}

function toPublishedIso(publicationDate: string | null | undefined, year: number | null | undefined): string {
  if (publicationDate && /^\d{4}-\d{2}-\d{2}$/.test(publicationDate)) return `${publicationDate}T00:00:00.000Z`;
  if (typeof year === "number") return `${year}-01-01T00:00:00.000Z`;
  return new Date(0).toISOString();
}

function isPaperInDateRange(paper: PaperInput, input: { dateFrom: string; dateTo: string }): boolean {
  return paper.publishedAt >= `${input.dateFrom}T00:00:00.000Z` && paper.publishedAt <= `${input.dateTo}T23:59:59.999Z`;
}
