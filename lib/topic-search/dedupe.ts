import type { DedupedTopicSearchCandidate, TopicSearchCandidate, TopicDiscoveryChannel } from "@/lib/topic-search/types";

export function dedupeTopicSearchCandidates(candidates: TopicSearchCandidate[]): DedupedTopicSearchCandidate[] {
  const byKey = new Map<string, DedupedTopicSearchCandidate>();

  for (const candidate of candidates) {
    const dedupeKey = getDedupeKey(candidate);
    const existing = byKey.get(dedupeKey);
    if (!existing) {
      byKey.set(dedupeKey, {
        paper: candidate.paper,
        matchedQueries: uniqueStrings(candidate.matchedQueries),
        canonicalPlatform: candidate.canonicalPlatform,
        canonicalUrl: candidate.canonicalUrl,
        externalIds: normalizeExternalIds(candidate.externalIds),
        discoveryChannels: [candidate.discoveryChannel],
        dedupeKey
      });
      continue;
    }

    byKey.set(dedupeKey, {
      ...existing,
      paper: preferPaper(existing.paper, candidate.paper),
      matchedQueries: uniqueStrings([...existing.matchedQueries, ...candidate.matchedQueries]),
      canonicalPlatform: existing.canonicalPlatform !== "unknown" ? existing.canonicalPlatform : candidate.canonicalPlatform,
      canonicalUrl: existing.canonicalUrl || candidate.canonicalUrl,
      externalIds: { ...existing.externalIds, ...normalizeExternalIds(candidate.externalIds) },
      discoveryChannels: uniqueDiscoveryChannels([...existing.discoveryChannels, candidate.discoveryChannel])
    });
  }

  return [...byKey.values()];
}

function getDedupeKey(candidate: TopicSearchCandidate): string {
  const ids = normalizeExternalIds(candidate.externalIds);
  const arxivId = normalizeArxivId(ids.arxiv ?? (candidate.paper.source === "arxiv" ? candidate.paper.sourceId : undefined));
  if (arxivId) return `arxiv:${arxivId}`;
  if (ids.openreview) return `openreview:${ids.openreview}`;
  if (ids.doi) return `doi:${ids.doi.toLowerCase()}`;
  if (ids.semanticScholar) return `semantic_scholar:${ids.semanticScholar}`;
  if (ids.corpusId) return `semantic_scholar_corpus:${ids.corpusId}`;
  return `title:${normalizeTitle(candidate.paper.title)}`;
}

function normalizeExternalIds(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nextValue]) => [key, nextValue.trim()] as const)
      .filter(([, nextValue]) => Boolean(nextValue))
  );
}

function normalizeArxivId(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(/(?:arxiv:|abs\/)?(\d{4}\.\d{4,5})(?:v\d+)?/i);
  return match?.[1] ?? null;
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function uniqueDiscoveryChannels(values: TopicDiscoveryChannel[]): TopicDiscoveryChannel[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function preferPaper(left: TopicSearchCandidate["paper"], right: TopicSearchCandidate["paper"]): TopicSearchCandidate["paper"] {
  if (!left.abstract && right.abstract) return right;
  if (left.source !== "arxiv" && right.source === "arxiv") return right;
  return left;
}
