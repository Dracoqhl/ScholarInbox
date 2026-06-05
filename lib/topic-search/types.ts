import type { TopicSearchSource } from "@/lib/topic-search/profile";
import type { PaperInput } from "@/lib/papers/types";

export type TopicDiscoveryChannel = "arxiv_search" | "semantic_scholar" | "openreview";
export type TopicCanonicalPlatform = "arxiv" | "openreview" | "doi" | "acl_anthology" | "publisher" | "unknown";
export type TopicSearchRunStatus = "running" | "completed" | "failed";
export type TopicSearchLogLevel = "info" | "error";
export type TopicSearchLogStage = "submitted" | "retrieving" | "deduplicating" | "filtering" | "storing" | "homepage_analysis" | "pdf_analysis" | "completed" | "failed";

export type TopicSearchProfileRecord = {
  id: string;
  slug: string;
  label: string;
  publicTag: string;
  filePath: string;
  dateFrom: string;
  dateTo: string;
  sources: TopicSearchSource[];
  profileHash: string;
  createdAt: string;
  updatedAt: string;
};

export type TopicSearchLogEntry = {
  at: string;
  level: TopicSearchLogLevel;
  stage?: TopicSearchLogStage;
  message: string;
  details?: Record<string, unknown>;
};

export type TopicSearchRun = {
  id: string;
  profileId: string;
  status: TopicSearchRunStatus;
  dateFrom: string;
  dateTo: string;
  sources: TopicSearchSource[];
  candidateCount: number;
  dedupedCount: number;
  acceptedCount: number;
  insertedCount: number;
  existingCount: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  logs: TopicSearchLogEntry[];
};

export type PaperTopicMatch = {
  paperId: string;
  profileId: string;
  runId: string;
  profileSlug: string;
  profileLabel: string;
  publicTag: string;
  profileScore: number | null;
  matchedReason: string;
  matchedQueries: string[];
  discoveryChannels: TopicDiscoveryChannel[];
  canonicalPlatform: TopicCanonicalPlatform;
  canonicalUrl: string;
  externalIds: Record<string, string>;
  dedupeKey: string;
  checkedAt: string;
};

export type TopicSearchCandidate = {
  paper: PaperInput;
  discoveryChannel: TopicDiscoveryChannel;
  matchedQueries: string[];
  canonicalPlatform: TopicCanonicalPlatform;
  canonicalUrl: string;
  externalIds: Record<string, string>;
};

export type DedupedTopicSearchCandidate = Omit<TopicSearchCandidate, "discoveryChannel"> & {
  discoveryChannels: TopicDiscoveryChannel[];
  dedupeKey: string;
};

export type TopicFilterResult = {
  dedupeKey: string;
  accepted: boolean;
  score: number | null;
  reason: string;
};

export type TopicSearchProfileRow = {
  id: string;
  slug: string;
  label: string;
  public_tag: string;
  file_path: string;
  date_from: string;
  date_to: string;
  sources_json: string;
  profile_hash: string;
  created_at: string;
  updated_at: string;
};

export type TopicSearchRunRow = {
  id: string;
  profile_id: string;
  status: TopicSearchRunStatus;
  date_from: string;
  date_to: string;
  sources_json: string;
  candidate_count: number;
  deduped_count: number;
  accepted_count: number;
  inserted_count: number;
  existing_count: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  log_json: string | null;
};

export type PaperTopicMatchRow = {
  paper_id: string;
  profile_id: string;
  run_id: string;
  profile_slug: string;
  profile_label: string;
  public_tag: string;
  profile_score: number | null;
  matched_reason: string;
  matched_queries_json: string;
  discovery_channels_json: string;
  canonical_platform: TopicCanonicalPlatform;
  canonical_url: string;
  external_ids_json: string;
  dedupe_key: string;
  checked_at: string;
};
