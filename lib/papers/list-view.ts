import type { Paper } from "@/lib/papers/types";

export type PaperSortMode = "date" | "score";

export type PaperDateGroup = {
  date: string;
  papers: Paper[];
};

export function sortPapersForList(papers: Paper[], mode: PaperSortMode): Paper[] {
  return [...papers].sort((left, right) => {
    if (mode === "score") {
      return compareScore(left, right) || comparePublishedAt(left, right) || compareCreatedAt(left, right);
    }

    return comparePublishedDate(left, right) || compareScore(left, right) || comparePublishedAt(left, right) || compareCreatedAt(left, right);
  });
}

export function groupPapersByPublishedDate(papers: Paper[]): PaperDateGroup[] {
  const groups = new Map<string, Paper[]>();
  for (const paper of papers) {
    const date = toDateKey(paper.publishedAt);
    groups.set(date, [...(groups.get(date) ?? []), paper]);
  }
  return [...groups.entries()].map(([date, groupPapers]) => ({ date, papers: groupPapers }));
}

export function toDateKey(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function compareScore(left: Paper, right: Paper): number {
  return (right.filterScore ?? -1) - (left.filterScore ?? -1);
}

function comparePublishedDate(left: Paper, right: Paper): number {
  return toDateKey(right.publishedAt).localeCompare(toDateKey(left.publishedAt));
}

function comparePublishedAt(left: Paper, right: Paper): number {
  return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
}

function compareCreatedAt(left: Paper, right: Paper): number {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}
