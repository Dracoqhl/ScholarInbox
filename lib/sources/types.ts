import type { PaperInput } from "@/lib/papers/types";

export type PaperSourceFetchOptions = {
  categories: string[];
  dateFrom: string;
  dateTo: string;
  maxResults?: number;
};

export type PaperSourceFetcher = (options: PaperSourceFetchOptions) => Promise<PaperInput[]>;
