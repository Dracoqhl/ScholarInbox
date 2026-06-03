export type PaperStatus = "new" | "skipped" | "archived" | "irrelevant";
export type PaperFilterMethod = "llm" | "prefilter";

export type UserTag = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
};

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
  userNote: string;
  filterMatched: boolean | null;
  filterScore: number | null;
  filterMethod: PaperFilterMethod | null;
  filterProfileHash: string | null;
  filterCheckedAt: string | null;
  filterError: string | null;
  analysisSummaryZh: string | null;
  analysisProblemZh: string | null;
  analysisMethodZh: string | null;
  analysisContributionZh: string | null;
  analysisDetailZh: string | null;
  analysisModel: string | null;
  analysisCheckedAt: string | null;
  analysisError: string | null;
  pdfAnalysisOverviewZh: string | null;
  pdfAnalysisBackgroundZh: string | null;
  pdfAnalysisProblemFormulationZh: string | null;
  pdfAnalysisMethodZh: string | null;
  pdfAnalysisKeyIdeasZh: string | null;
  pdfAnalysisExperimentsZh: string | null;
  pdfAnalysisLimitationsZh: string | null;
  pdfAnalysisReadingGuideZh: string | null;
  pdfAnalysisAffiliations: string | null;
  pdfAnalysisModel: string | null;
  pdfAnalysisCheckedAt: string | null;
  pdfAnalysisError: string | null;
  keywordTags: string[];
  userTags: UserTag[];
  githubUrls: string[];
  createdAt: string;
  updatedRecordAt: string;
};

export type PaperListFilters = {
  favorite?: boolean;
  matched?: boolean;
  query?: string;
  status?: PaperStatus;
  userTagIds?: string[];
  keywordTags?: string[];
  publishedFrom?: string;
  publishedTo?: string;
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

export type PaperAnalysisResult = {
  summaryZh: string;
  problemZh: string;
  methodZh: string;
  contributionZh: string;
  detailZh: string;
  keywordTags: string[];
  model: string;
  checkedAt: string;
  error: string | null;
};

export type PaperPdfAnalysisResult = {
  overviewZh: string;
  backgroundZh: string;
  problemFormulationZh: string;
  methodZh: string;
  keyIdeasZh: string;
  experimentsZh: string;
  limitationsZh: string;
  readingGuideZh: string;
  affiliations: string;
  keywordTags: string[];
  model: string;
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
  analysis_summary_zh: string | null;
  analysis_problem_zh: string | null;
  analysis_method_zh: string | null;
  analysis_contribution_zh: string | null;
  analysis_detail_zh: string | null;
  analysis_model: string | null;
  analysis_checked_at: string | null;
  analysis_error: string | null;
  pdf_analysis_overview_zh: string | null;
  pdf_analysis_background_zh: string | null;
  pdf_analysis_problem_formulation_zh: string | null;
  pdf_analysis_method_zh: string | null;
  pdf_analysis_key_ideas_zh: string | null;
  pdf_analysis_experiments_zh: string | null;
  pdf_analysis_limitations_zh: string | null;
  pdf_analysis_reading_guide_zh: string | null;
  pdf_analysis_affiliations: string | null;
  pdf_analysis_model: string | null;
  pdf_analysis_checked_at: string | null;
  pdf_analysis_error: string | null;
  keyword_tags_json: string | null;
  created_at: string;
  updated_record_at: string;
  status: PaperStatus | null;
  is_favorite: number | null;
  user_note: string | null;
  user_tags_json: string | null;
};
