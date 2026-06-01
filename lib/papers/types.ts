export type PaperStatus = "new" | "interested" | "reading" | "done" | "archived";

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
  createdAt: string;
  updatedRecordAt: string;
};

export type PaperListFilters = {
  favorite?: boolean;
  query?: string;
  status?: PaperStatus;
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
  created_at: string;
  updated_record_at: string;
  status: PaperStatus | null;
  is_favorite: number | null;
};
