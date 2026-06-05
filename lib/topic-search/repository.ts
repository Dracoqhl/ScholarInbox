import { randomUUID } from "node:crypto";

import type { SqliteDatabase } from "@/lib/db/database";
import { TOPIC_SEARCH_SOURCES, type TopicSearchSource } from "@/lib/topic-search/profile";
import type {
  PaperTopicMatch,
  PaperTopicMatchRow,
  TopicCanonicalPlatform,
  TopicDiscoveryChannel,
  TopicSearchLogEntry,
  TopicSearchProfileRecord,
  TopicSearchProfileRow,
  TopicSearchRun,
  TopicSearchRunRow,
  TopicSearchRunStatus
} from "@/lib/topic-search/types";

export function createTopicSearchRepository(db: SqliteDatabase) {
  return new TopicSearchRepository(db);
}

class TopicSearchRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async upsertProfile(input: {
    slug: string;
    label: string;
    publicTag: string;
    filePath: string;
    dateFrom: string;
    dateTo: string;
    sources: string[];
    profileHash: string;
  }): Promise<TopicSearchProfileRecord> {
    const now = new Date().toISOString();
    const existing = this.db.prepare("SELECT id FROM search_profiles WHERE slug = @slug COLLATE NOCASE").get<{ id: string }>({ slug: input.slug });
    const id = existing?.id ?? randomUUID();
    if (existing) {
      this.db
        .prepare(
          `UPDATE search_profiles
           SET label = @label,
               public_tag = @publicTag,
               file_path = @filePath,
               date_from = @dateFrom,
               date_to = @dateTo,
               sources_json = @sourcesJson,
               profile_hash = @profileHash,
               updated_at = @updatedAt
           WHERE id = @id`
        )
        .run({
          id,
          label: input.label,
          publicTag: input.publicTag,
          filePath: input.filePath,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          sourcesJson: JSON.stringify(input.sources),
          profileHash: input.profileHash,
          updatedAt: now
        });
    } else {
      this.db
        .prepare(
          `INSERT INTO search_profiles
           (id, slug, label, public_tag, file_path, date_from, date_to, sources_json, profile_hash, created_at, updated_at)
           VALUES
           (@id, @slug, @label, @publicTag, @filePath, @dateFrom, @dateTo, @sourcesJson, @profileHash, @createdAt, @updatedAt)`
        )
        .run({
          id,
          slug: input.slug,
          label: input.label,
          publicTag: input.publicTag,
          filePath: input.filePath,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          sourcesJson: JSON.stringify(input.sources),
          profileHash: input.profileHash,
          createdAt: now,
          updatedAt: now
        });
    }
    return this.getProfile(id) as Promise<TopicSearchProfileRecord>;
  }

  async getProfile(id: string): Promise<TopicSearchProfileRecord | null> {
    const row = this.db.prepare("SELECT * FROM search_profiles WHERE id = @id").get<TopicSearchProfileRow>({ id });
    return row ? mapProfile(row) : null;
  }

  async getProfileBySlug(slug: string): Promise<TopicSearchProfileRecord | null> {
    const row = this.db.prepare("SELECT * FROM search_profiles WHERE slug = @slug COLLATE NOCASE").get<TopicSearchProfileRow>({ slug });
    return row ? mapProfile(row) : null;
  }

  async startRun(input: { profileId: string; dateFrom: string; dateTo: string; sources: string[] }): Promise<TopicSearchRun> {
    const now = new Date().toISOString();
    const run: TopicSearchRun = {
      id: randomUUID(),
      profileId: input.profileId,
      status: "running",
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      sources: input.sources as TopicSearchRun["sources"],
      candidateCount: 0,
      dedupedCount: 0,
      acceptedCount: 0,
      insertedCount: 0,
      existingCount: 0,
      errorMessage: null,
      startedAt: now,
      finishedAt: null,
      logs: []
    };
    this.db
      .prepare(
        `INSERT INTO topic_search_runs
         (id, profile_id, status, date_from, date_to, sources_json, candidate_count, deduped_count,
          accepted_count, inserted_count, existing_count, error_message, started_at, finished_at, log_json)
         VALUES
         (@id, @profileId, @status, @dateFrom, @dateTo, @sourcesJson, @candidateCount, @dedupedCount,
          @acceptedCount, @insertedCount, @existingCount, @errorMessage, @startedAt, @finishedAt, @logJson)`
      )
      .run(toRunParams(run));
    return run;
  }

  async appendRunLog(id: string, entry: Omit<TopicSearchLogEntry, "at"> & { at?: string }): Promise<TopicSearchRun> {
    const run = await this.getRun(id);
    if (!run) throw new Error(`Topic search run not found: ${id}`);
    const nextEntry: TopicSearchLogEntry = {
      at: entry.at ?? new Date().toISOString(),
      level: entry.level,
      message: entry.message,
      ...(entry.stage ? { stage: entry.stage } : {}),
      ...(entry.details ? { details: entry.details } : {})
    };
    const logs = [...run.logs, nextEntry];
    this.db.prepare("UPDATE topic_search_runs SET log_json = @logJson WHERE id = @id").run({ id, logJson: JSON.stringify(logs) });
    return { ...run, logs };
  }

  async finishRun(
    id: string,
    result: {
      status: Exclude<TopicSearchRunStatus, "running">;
      candidateCount: number;
      dedupedCount: number;
      acceptedCount: number;
      insertedCount: number;
      existingCount: number;
      errorMessage?: string | null;
    }
  ): Promise<TopicSearchRun> {
    this.db
      .prepare(
        `UPDATE topic_search_runs
         SET status = @status,
             candidate_count = @candidateCount,
             deduped_count = @dedupedCount,
             accepted_count = @acceptedCount,
             inserted_count = @insertedCount,
             existing_count = @existingCount,
             error_message = @errorMessage,
             finished_at = @finishedAt
         WHERE id = @id`
      )
      .run({
        id,
        status: result.status,
        candidateCount: result.candidateCount,
        dedupedCount: result.dedupedCount,
        acceptedCount: result.acceptedCount,
        insertedCount: result.insertedCount,
        existingCount: result.existingCount,
        errorMessage: result.errorMessage ?? null,
        finishedAt: new Date().toISOString()
      });
    return (await this.getRun(id)) as TopicSearchRun;
  }

  async getRun(id: string): Promise<TopicSearchRun | null> {
    const row = this.db.prepare("SELECT * FROM topic_search_runs WHERE id = @id").get<TopicSearchRunRow>({ id });
    return row ? mapRun(row) : null;
  }

  async listRuns(input: { limit?: number } = {}): Promise<TopicSearchRun[]> {
    const limit = normalizeLimit(input.limit);
    const sql = limit
      ? "SELECT * FROM topic_search_runs ORDER BY started_at DESC LIMIT @limit"
      : "SELECT * FROM topic_search_runs ORDER BY started_at DESC";
    return this.db
      .prepare(sql)
      .all<TopicSearchRunRow>(limit ? { limit } : undefined)
      .map(mapRun);
  }

  async upsertPaperMatch(input: Omit<PaperTopicMatch, "checkedAt"> & { checkedAt?: string }): Promise<PaperTopicMatch> {
    const checkedAt = input.checkedAt ?? new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO paper_topic_matches
         (paper_id, profile_id, run_id, profile_slug, profile_label, public_tag, profile_score, matched_reason,
          matched_queries_json, discovery_channels_json, canonical_platform, canonical_url, external_ids_json, dedupe_key, checked_at)
         VALUES
         (@paperId, @profileId, @runId, @profileSlug, @profileLabel, @publicTag, @profileScore, @matchedReason,
          @matchedQueriesJson, @discoveryChannelsJson, @canonicalPlatform, @canonicalUrl, @externalIdsJson, @dedupeKey, @checkedAt)
         ON CONFLICT(paper_id, profile_id) DO UPDATE SET
           run_id = excluded.run_id,
           profile_slug = excluded.profile_slug,
           profile_label = excluded.profile_label,
           public_tag = excluded.public_tag,
           profile_score = excluded.profile_score,
           matched_reason = excluded.matched_reason,
           matched_queries_json = excluded.matched_queries_json,
           discovery_channels_json = excluded.discovery_channels_json,
           canonical_platform = excluded.canonical_platform,
           canonical_url = excluded.canonical_url,
           external_ids_json = excluded.external_ids_json,
           dedupe_key = excluded.dedupe_key,
           checked_at = excluded.checked_at`
      )
      .run({
        paperId: input.paperId,
        profileId: input.profileId,
        runId: input.runId,
        profileSlug: input.profileSlug,
        profileLabel: input.profileLabel,
        publicTag: input.publicTag,
        profileScore: input.profileScore,
        matchedReason: input.matchedReason,
        matchedQueriesJson: JSON.stringify(input.matchedQueries),
        discoveryChannelsJson: JSON.stringify(input.discoveryChannels),
        canonicalPlatform: input.canonicalPlatform,
        canonicalUrl: input.canonicalUrl,
        externalIdsJson: JSON.stringify(input.externalIds),
        dedupeKey: input.dedupeKey,
        checkedAt
      });
    return (await this.listPaperMatches(input.paperId)).find((match) => match.profileId === input.profileId) as PaperTopicMatch;
  }

  async listPaperMatches(paperId: string): Promise<PaperTopicMatch[]> {
    return this.db
      .prepare("SELECT * FROM paper_topic_matches WHERE paper_id = @paperId ORDER BY profile_label COLLATE NOCASE ASC")
      .all<PaperTopicMatchRow>({ paperId })
      .map(mapPaperMatch);
  }
}

function toRunParams(run: TopicSearchRun) {
  return {
    id: run.id,
    profileId: run.profileId,
    status: run.status,
    dateFrom: run.dateFrom,
    dateTo: run.dateTo,
    sourcesJson: JSON.stringify(run.sources),
    candidateCount: run.candidateCount,
    dedupedCount: run.dedupedCount,
    acceptedCount: run.acceptedCount,
    insertedCount: run.insertedCount,
    existingCount: run.existingCount,
    errorMessage: run.errorMessage,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    logJson: JSON.stringify(run.logs)
  };
}

function mapProfile(row: TopicSearchProfileRow): TopicSearchProfileRecord {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    publicTag: row.public_tag,
    filePath: row.file_path,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    sources: parseTopicSearchSources(row.sources_json),
    profileHash: row.profile_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRun(row: TopicSearchRunRow): TopicSearchRun {
  return {
    id: row.id,
    profileId: row.profile_id,
    status: row.status,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    sources: parseTopicSearchSources(row.sources_json),
    candidateCount: row.candidate_count,
    dedupedCount: row.deduped_count,
    acceptedCount: row.accepted_count,
    insertedCount: row.inserted_count,
    existingCount: row.existing_count,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    logs: parseLogs(row.log_json)
  };
}

function mapPaperMatch(row: PaperTopicMatchRow): PaperTopicMatch {
  return {
    paperId: row.paper_id,
    profileId: row.profile_id,
    runId: row.run_id,
    profileSlug: row.profile_slug,
    profileLabel: row.profile_label,
    publicTag: row.public_tag,
    profileScore: row.profile_score,
    matchedReason: row.matched_reason,
    matchedQueries: parseJsonArray(row.matched_queries_json),
    discoveryChannels: parseDiscoveryChannels(row.discovery_channels_json),
    canonicalPlatform: parseCanonicalPlatform(row.canonical_platform),
    canonicalUrl: row.canonical_url,
    externalIds: parseJsonObject(row.external_ids_json),
    dedupeKey: row.dedupe_key,
    checkedAt: row.checked_at
  };
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseTopicSearchSources(value: string | null): TopicSearchSource[] {
  const allowed = new Set<string>(TOPIC_SEARCH_SOURCES);
  return parseJsonArray(value).filter((item): item is TopicSearchSource => allowed.has(item));
}

function parseDiscoveryChannels(value: string | null): TopicDiscoveryChannel[] {
  const allowed = new Set<string>(["arxiv_search", "semantic_scholar", "openreview"]);
  return parseJsonArray(value).filter((item): item is TopicDiscoveryChannel => allowed.has(item));
}

function parseCanonicalPlatform(value: string): TopicCanonicalPlatform {
  if (["arxiv", "openreview", "doi", "acl_anthology", "publisher", "unknown"].includes(value)) {
    return value as TopicCanonicalPlatform;
  }
  return "unknown";
}

function parseJsonObject(value: string | null): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

function parseLogs(value: string | null): TopicSearchLogEntry[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTopicSearchLogEntry);
  } catch {
    return [];
  }
}

function isTopicSearchLogEntry(value: unknown): value is TopicSearchLogEntry {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.at === "string" &&
    (record.level === "info" || record.level === "error") &&
    typeof record.message === "string" &&
    (record.stage === undefined || typeof record.stage === "string") &&
    (record.details === undefined || (record.details !== null && typeof record.details === "object" && !Array.isArray(record.details)))
  );
}

function normalizeLimit(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(100, Math.trunc(value)));
}
