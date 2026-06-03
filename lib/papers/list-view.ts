import type { Paper, PaperStatus } from "@/lib/papers/types";

export type PaperSortMode = "date" | "score";
export type PaperListMode = "inbox" | "archive" | "favorites";

export type PaperVisibilityFilters = {
  mode: PaperListMode;
  status: PaperStatus | "all";
  selectedUserTagIds: string[];
  keywordTags: string[];
  publishedFrom: string;
  publishedTo: string;
};

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

export function shouldKeepPaperAfterLocalMutation(paper: Paper, filters: PaperVisibilityFilters): boolean {
  if (filters.mode === "inbox") return true;
  return paperMatchesVisibilityFilters(paper, filters);
}

export function paperMatchesVisibilityFilters(paper: Paper, filters: PaperVisibilityFilters): boolean {
  if (filters.mode === "favorites" && !paper.isFavorite) return false;
  if (filters.status !== "all" && paper.status !== filters.status) return false;
  if (filters.selectedUserTagIds.length && !filters.selectedUserTagIds.every((tagId) => paper.userTags.some((tag) => tag.id === tagId))) return false;
  if (filters.keywordTags.length && !filters.keywordTags.every((tag) => paper.keywordTags.includes(tag))) return false;
  if (filters.publishedFrom && paper.publishedAt < `${filters.publishedFrom}T00:00:00.000Z`) return false;
  if (filters.publishedTo && paper.publishedAt > `${filters.publishedTo}T23:59:59.999Z`) return false;
  return true;
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
