export type PaperStatus = "new" | "interested" | "reading" | "done" | "archived" | "irrelevant";
export type PaperFilterMethod = "llm" | "prefilter";

export type PaperInput = {
  source: string;
  sourceId: string;
  title: string;
  abstract: string;
  authors: string[];
  categories: string[];
  primaryCategory: string;
  publishedAt: string;
  updatedAt: string | null;
  sourceUrl: string;
  pdfUrl: string;
};

export type Paper = PaperInput & {
  id: string;
  status: PaperStatus;
  isFavorite: boolean;
  filterMatched: boolean | null;
  filterScore: number | null;
  filterMethod: PaperFilterMethod | null;
  filterProfileHash: string | null;
  filterCheckedAt: string | null;
  filterError: string | null;
  createdAt: string;
  updatedRecordAt: string;
};

export type PaperListFilters = {
  favorite?: boolean;
  matched?: boolean;
  query?: string;
  status?: PaperStatus;
};

export type PaperDeleteFilters = {
  matched?: boolean;
  status?: PaperStatus;
};

export type PaperFilterResult = {
  matched: boolean;
  score: number | null;
  method: PaperFilterMethod;
  profileHash: string;
  checkedAt: string;
  error: string | null;
};

export type PaperRow = {
  id: string;
  source: string;
  source_id: string;
  title: string;
  abstract: string;
  authors_json: string;
  categories_json: string;
  primary_category: string;
  published_at: string;
  updated_at: string | null;
  source_url: string;
  pdf_url: string;
  filter_matched: number | null;
  filter_score: number | null;
  filter_method: PaperFilterMethod | null;
  filter_profile_hash: string | null;
  filter_checked_at: string | null;
  filter_error: string | null;
  created_at: string;
  updated_record_at: string;
  status: PaperStatus | null;
  is_favorite: number | null;
};
