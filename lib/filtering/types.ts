import type { PaperFilterMethod } from "@/lib/papers/types";

export type InterestFilterResult = {
  sourceId: string;
  matched: boolean;
  score: number | null;
  method: PaperFilterMethod;
  profileHash: string;
  checkedAt: string;
  error: string | null;
};
