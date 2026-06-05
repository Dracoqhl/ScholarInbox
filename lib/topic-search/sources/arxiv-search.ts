import { parseArxivFeed } from "@/lib/sources/arxiv";
import type { TopicSearchCandidate } from "@/lib/topic-search/types";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";

type FetchLike = typeof fetch;

export type ArxivTopicSearchOptions = {
  querySeeds: string[];
  dateFrom: string;
  dateTo: string;
  maxResults?: number;
  fetcher?: FetchLike;
};

export async function fetchArxivTopicCandidates(options: ArxivTopicSearchOptions): Promise<TopicSearchCandidate[]> {
  const fetcher = options.fetcher ?? fetch;
  const maxResults = Math.max(1, Math.min(options.maxResults ?? 50, 200));
  const candidates: TopicSearchCandidate[] = [];

  for (const querySeed of options.querySeeds) {
    if (candidates.length >= maxResults) break;
    const response = await fetcher(buildArxivTopicSearchUrl({ ...options, querySeed, maxResults: maxResults - candidates.length }));
    if (!response.ok) throw new Error(`arXiv topic search request failed with ${response.status}`);
    const papers = parseArxivFeed(await response.text());
    for (const paper of papers) {
      candidates.push({
        paper,
        discoveryChannel: "arxiv_search",
        matchedQueries: [querySeed],
        canonicalPlatform: "arxiv",
        canonicalUrl: paper.sourceUrl,
        externalIds: { arxiv: paper.sourceId }
      });
      if (candidates.length >= maxResults) break;
    }
  }

  return candidates;
}

function buildArxivTopicSearchUrl(input: { querySeed: string; dateFrom: string; dateTo: string; maxResults: number }): URL {
  const url = new URL(ARXIV_API_URL);
  const query = `all:"${escapeArxivQueryPhrase(input.querySeed)}" AND submittedDate:[${toArxivDate(input.dateFrom, "0000")} TO ${toArxivDate(input.dateTo, "2359")}]`;
  url.searchParams.set("search_query", query);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(input.maxResults));
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");
  return url;
}

function escapeArxivQueryPhrase(value: string): string {
  return value.replaceAll('"', " ").replace(/\s+/g, " ").trim();
}

function toArxivDate(date: string, time: string): string {
  return `${date.replaceAll("-", "")}${time}`;
}
