import { randomUUID } from "crypto";

import type { SqliteDatabase } from "@/lib/db/database";
import { extractGithubUrls } from "@/lib/papers/github-links";
import type { Paper, PaperAnalysisResult, PaperDeleteFilters, PaperFilterResult, PaperInput, PaperListFilters, PaperPdfAnalysisResult, PaperRow, PaperStatus, UserTag } from "@/lib/papers/types";

export function createPaperRepository(db: SqliteDatabase) {
  return new PaperRepository(db);
}

class PaperRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async upsert(input: PaperInput): Promise<{ paper: Paper; inserted: boolean }> {
    const existing = this.db
      .prepare("SELECT id FROM papers WHERE source = @source AND source_id = @sourceId")
      .get<{ id: string }>({ source: input.source, sourceId: input.sourceId });
    const now = new Date().toISOString();

    if (existing) {
      this.db
        .prepare(
          `UPDATE papers
           SET title = @title,
               abstract = @abstract,
               authors_json = @authorsJson,
               categories_json = @categoriesJson,
               primary_category = @primaryCategory,
               published_at = @publishedAt,
               updated_at = @updatedAt,
               source_url = @sourceUrl,
               pdf_url = @pdfUrl,
               updated_record_at = @updatedRecordAt
           WHERE id = @id`
        )
        .run(toPaperParams({ ...input, id: existing.id, updatedRecordAt: now }));

      return { paper: (await this.get(existing.id)) as Paper, inserted: false };
    }

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO papers
         (id, source, source_id, title, abstract, authors_json, categories_json, primary_category,
          published_at, updated_at, source_url, pdf_url, created_at, updated_record_at)
         VALUES
         (@id, @source, @sourceId, @title, @abstract, @authorsJson, @categoriesJson, @primaryCategory,
          @publishedAt, @updatedAt, @sourceUrl, @pdfUrl, @createdAt, @updatedRecordAt)`
      )
      .run(toPaperParams({ ...input, id, createdAt: now, updatedRecordAt: now }));

    this.db
      .prepare(
        `INSERT INTO paper_states (paper_id, status, is_favorite, user_note, updated_at)
         VALUES (@paperId, 'new', 0, '', @updatedAt)`
      )
      .run({ paperId: id, updatedAt: now });

    return { paper: (await this.get(id)) as Paper, inserted: true };
  }

  async get(id: string): Promise<Paper | null> {
    const row = this.db.prepare(baseSelect("WHERE papers.id = @id")).get<PaperRow>({ id });
    return row ? mapPaper(row) : null;
  }

  async list(filters: PaperListFilters = {}): Promise<Paper[]> {
    const where: string[] = [];
    const params: Record<string, unknown> = {};

    if (filters.favorite !== undefined) {
      where.push("paper_states.is_favorite = @favorite");
      params.favorite = filters.favorite ? 1 : 0;
    }

    if (filters.status) {
      where.push("paper_states.status = @status");
      params.status = filters.status;
    }

    if (filters.userTagIds?.length) {
      filters.userTagIds.forEach((tagId, index) => {
        where.push(
          `EXISTS (
             SELECT 1 FROM paper_user_tags user_tag_filter_${index}
             WHERE user_tag_filter_${index}.paper_id = papers.id
               AND user_tag_filter_${index}.tag_id = @userTagId${index}
           )`
        );
        params[`userTagId${index}`] = tagId;
      });
    }

    if (filters.keywordTags?.length) {
      filters.keywordTags.forEach((tag, index) => {
        where.push("papers.keyword_tags_json LIKE @keywordTag" + index);
        params[`keywordTag${index}`] = `%${JSON.stringify(tag)}%`;
      });
    }

    if (filters.publishedFrom?.trim()) {
      where.push("papers.published_at >= @publishedFrom");
      params.publishedFrom = toDateBoundary(filters.publishedFrom, "start");
    }

    if (filters.publishedTo?.trim()) {
      where.push("papers.published_at <= @publishedTo");
      params.publishedTo = toDateBoundary(filters.publishedTo, "end");
    }

    if (filters.matched !== undefined) {
      where.push(toMatchedWhereClause(filters.matched));
      params.matched = filters.matched ? 1 : 0;
    }

    if (filters.query?.trim()) {
      where.push("(papers.title LIKE @query OR papers.abstract LIKE @query)");
      params.query = `%${filters.query.trim()}%`;
    }

    const rows = this.db
      .prepare(baseSelect(where.length ? `WHERE ${where.join(" AND ")}` : "") + orderByClause(filters))
      .all<PaperRow>(params);

    return rows.map(mapPaper);
  }

  async deleteMany(filters: PaperDeleteFilters): Promise<{ deletedCount: number }> {
    const where: string[] = [];
    const params: Record<string, unknown> = {};

    if (filters.status) {
      where.push("paper_states.status = @status");
      params.status = filters.status;
    }

    if (filters.matched !== undefined) {
      where.push(toMatchedWhereClause(filters.matched));
      params.matched = filters.matched ? 1 : 0;
    }

    if (where.length === 0) {
      throw new Error("deleteMany requires at least one filter.");
    }

    const rows = this.db
      .prepare(
        `SELECT papers.id
         FROM papers
         JOIN paper_states ON paper_states.paper_id = papers.id
         WHERE ${where.join(" AND ")}`
      )
      .all<{ id: string }>(params);

    for (const row of rows) {
      this.db.prepare("DELETE FROM paper_states WHERE paper_id = @id").run({ id: row.id });
      this.db.prepare("DELETE FROM papers WHERE id = @id").run({ id: row.id });
    }

    return { deletedCount: rows.length };
  }

  async getCurrentFilterResult(source: string, sourceId: string, profileHash: string): Promise<PaperFilterResult | null> {
    const row = this.db
      .prepare(
        `SELECT filter_matched, filter_score, filter_method, filter_profile_hash, filter_checked_at, filter_error
         FROM papers
         WHERE source = @source
           AND source_id = @sourceId
           AND filter_profile_hash = @profileHash
           AND filter_matched IS NOT NULL
           AND filter_method IS NOT NULL
           AND filter_checked_at IS NOT NULL`
      )
      .get<Pick<PaperRow, "filter_matched" | "filter_score" | "filter_method" | "filter_profile_hash" | "filter_checked_at" | "filter_error">>({
        source,
        sourceId,
        profileHash
      });

    if (!row || row.filter_matched === null || !row.filter_method || !row.filter_profile_hash || !row.filter_checked_at) return null;

    return {
      matched: row.filter_matched === 1,
      score: row.filter_score,
      method: row.filter_method,
      profileHash: row.filter_profile_hash,
      checkedAt: row.filter_checked_at,
      error: row.filter_error
    };
  }

  async setFilterResult(id: string, result: PaperFilterResult): Promise<Paper | null> {
    this.db
      .prepare(
        `UPDATE papers
         SET filter_matched = @filterMatched,
             filter_score = @filterScore,
             filter_method = @filterMethod,
             filter_profile_hash = @filterProfileHash,
             filter_checked_at = @filterCheckedAt,
             filter_error = @filterError,
             updated_record_at = @updatedRecordAt
         WHERE id = @id`
      )
      .run({
        id,
        filterMatched: result.matched ? 1 : 0,
        filterScore: result.score,
        filterMethod: result.method,
        filterProfileHash: result.profileHash,
        filterCheckedAt: result.checkedAt,
        filterError: result.error,
        updatedRecordAt: new Date().toISOString()
      });
    return this.get(id);
  }

  async setAnalysisResult(id: string, result: PaperAnalysisResult): Promise<Paper | null> {
    this.db
      .prepare(
        `UPDATE papers
         SET analysis_summary_zh = @summaryZh,
             analysis_problem_zh = @problemZh,
             analysis_method_zh = @methodZh,
             analysis_contribution_zh = @contributionZh,
             analysis_detail_zh = @detailZh,
             analysis_model = @model,
             analysis_checked_at = @checkedAt,
             analysis_error = @error,
             keyword_tags_json = @keywordTagsJson,
             updated_record_at = @updatedRecordAt
         WHERE id = @id`
      )
      .run({
        id,
        summaryZh: result.summaryZh,
        problemZh: result.problemZh,
        methodZh: result.methodZh,
        contributionZh: result.contributionZh,
        detailZh: result.detailZh,
        model: result.model,
        checkedAt: result.checkedAt,
        error: result.error,
        keywordTagsJson: JSON.stringify(normalizeKeywordTags(result.keywordTags)),
        updatedRecordAt: new Date().toISOString()
      });
    return this.get(id);
  }

  async setPdfAnalysisResult(id: string, result: PaperPdfAnalysisResult): Promise<Paper | null> {
    this.db
      .prepare(
        `UPDATE papers
         SET pdf_analysis_overview_zh = @overviewZh,
             pdf_analysis_background_zh = @backgroundZh,
             pdf_analysis_problem_formulation_zh = @problemFormulationZh,
             pdf_analysis_method_zh = @methodZh,
             pdf_analysis_key_ideas_zh = @keyIdeasZh,
             pdf_analysis_experiments_zh = @experimentsZh,
             pdf_analysis_limitations_zh = @limitationsZh,
             pdf_analysis_reading_guide_zh = @readingGuideZh,
             pdf_analysis_affiliations = @affiliations,
             pdf_analysis_model = @model,
             pdf_analysis_checked_at = @checkedAt,
             pdf_analysis_error = @error,
             keyword_tags_json = @keywordTagsJson,
             updated_record_at = @updatedRecordAt
         WHERE id = @id`
      )
      .run({
        id,
        overviewZh: result.overviewZh,
        backgroundZh: result.backgroundZh,
        problemFormulationZh: result.problemFormulationZh,
        methodZh: result.methodZh,
        keyIdeasZh: result.keyIdeasZh,
        experimentsZh: result.experimentsZh,
        limitationsZh: result.limitationsZh,
        readingGuideZh: result.readingGuideZh,
        affiliations: result.affiliations,
        model: result.model,
        checkedAt: result.checkedAt,
        error: result.error,
        keywordTagsJson: JSON.stringify(normalizeKeywordTags(result.keywordTags)),
        updatedRecordAt: new Date().toISOString()
      });
    return this.get(id);
  }

  async setFavorite(id: string, isFavorite: boolean): Promise<Paper | null> {
    const statusAssignment = isFavorite ? ", status = 'archived'" : "";
    this.db
      .prepare(`UPDATE paper_states SET is_favorite = @isFavorite${statusAssignment}, updated_at = @updatedAt WHERE paper_id = @id`)
      .run({ id, isFavorite: isFavorite ? 1 : 0, updatedAt: new Date().toISOString() });
    return this.get(id);
  }

  async setStatus(id: string, status: PaperStatus): Promise<Paper | null> {
    const favoriteAssignment = status === "irrelevant" || status === "skipped" ? ", is_favorite = 0" : "";
    this.db
      .prepare(`UPDATE paper_states SET status = @status${favoriteAssignment}, updated_at = @updatedAt WHERE paper_id = @id`)
      .run({ id, status, updatedAt: new Date().toISOString() });
    return this.get(id);
  }

  async setUserNote(id: string, userNote: string): Promise<Paper | null> {
    this.db
      .prepare("UPDATE paper_states SET user_note = @userNote, updated_at = @updatedAt WHERE paper_id = @id")
      .run({ id, userNote, updatedAt: new Date().toISOString() });
    return this.get(id);
  }

  async listUserTags(): Promise<UserTag[]> {
    const rows = this.db
      .prepare("SELECT id, name, color, created_at, updated_at FROM user_tags ORDER BY name COLLATE NOCASE ASC")
      .all<UserTagRow>();
    return rows.map(mapUserTag);
  }

  async createUserTag(input: { name: string; color: string }): Promise<UserTag> {
    const name = normalizeUserTagName(input.name);
    const color = normalizeUserTagColor(input.color);
    const now = new Date().toISOString();
    const existing = this.findUserTagByName(name);
    if (existing) return existing;

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO user_tags (id, name, color, created_at, updated_at)
         VALUES (@id, @name, @color, @createdAt, @updatedAt)`
      )
      .run({ id, name, color, createdAt: now, updatedAt: now });
    return this.findUserTagById(id) as UserTag;
  }

  async setUserTags(paperId: string, tagIds: string[]): Promise<Paper | null> {
    const uniqueTagIds = [...new Set(tagIds.map((tagId) => tagId.trim()).filter(Boolean))];
    const now = new Date().toISOString();
    this.db.prepare("DELETE FROM paper_user_tags WHERE paper_id = @paperId").run({ paperId });
    for (const tagId of uniqueTagIds) {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO paper_user_tags (paper_id, tag_id, created_at)
           VALUES (@paperId, @tagId, @createdAt)`
        )
        .run({ paperId, tagId, createdAt: now });
    }
    return this.get(paperId);
  }

  private findUserTagByName(name: string): UserTag | null {
    const row = this.db
      .prepare("SELECT id, name, color, created_at, updated_at FROM user_tags WHERE name = @name COLLATE NOCASE")
      .get<UserTagRow>({ name });
    return row ? mapUserTag(row) : null;
  }

  private findUserTagById(id: string): UserTag | null {
    const row = this.db
      .prepare("SELECT id, name, color, created_at, updated_at FROM user_tags WHERE id = @id")
      .get<UserTagRow>({ id });
    return row ? mapUserTag(row) : null;
  }
}

function baseSelect(whereClause: string): string {
  return `
    SELECT papers.*,
           paper_states.status,
           paper_states.is_favorite,
           paper_states.user_note,
           COALESCE((
             SELECT '[' || group_concat(tag_json) || ']'
             FROM (
               SELECT json_object(
                 'id', user_tags.id,
                 'name', user_tags.name,
                 'color', user_tags.color,
                 'createdAt', user_tags.created_at,
                 'updatedAt', user_tags.updated_at
               ) AS tag_json
               FROM paper_user_tags
               JOIN user_tags ON user_tags.id = paper_user_tags.tag_id
               WHERE paper_user_tags.paper_id = papers.id
               ORDER BY user_tags.name COLLATE NOCASE ASC
             )
           ), '[]') AS user_tags_json,
           COALESCE((
             SELECT '[' || group_concat(match_json) || ']'
             FROM (
               SELECT json_object(
                 'paperId', paper_topic_matches.paper_id,
                 'profileId', paper_topic_matches.profile_id,
                 'runId', paper_topic_matches.run_id,
                 'profileSlug', paper_topic_matches.profile_slug,
                 'profileLabel', paper_topic_matches.profile_label,
                 'publicTag', paper_topic_matches.public_tag,
                 'profileScore', paper_topic_matches.profile_score,
                 'matchedReason', paper_topic_matches.matched_reason,
                 'matchedQueries', json(paper_topic_matches.matched_queries_json),
                 'discoveryChannels', json(paper_topic_matches.discovery_channels_json),
                 'canonicalPlatform', paper_topic_matches.canonical_platform,
                 'canonicalUrl', paper_topic_matches.canonical_url,
                 'externalIds', json(paper_topic_matches.external_ids_json),
                 'dedupeKey', paper_topic_matches.dedupe_key,
                 'checkedAt', paper_topic_matches.checked_at
               ) AS match_json
               FROM paper_topic_matches
               WHERE paper_topic_matches.paper_id = papers.id
               ORDER BY paper_topic_matches.profile_label COLLATE NOCASE ASC
             )
           ), '[]') AS topic_matches_json
    FROM papers
    JOIN paper_states ON paper_states.paper_id = papers.id
    ${whereClause}
  `;
}

function orderByClause(filters: PaperListFilters): string {
  if (filters.matched === true) {
    return " ORDER BY papers.filter_score IS NULL, papers.filter_score DESC, papers.published_at DESC, papers.created_at DESC";
  }

  return " ORDER BY papers.published_at DESC, papers.created_at DESC";
}

function toMatchedWhereClause(matched: boolean): string {
  const topicMatchedClause = "EXISTS (SELECT 1 FROM paper_topic_matches WHERE paper_topic_matches.paper_id = papers.id)";
  if (matched) {
    return `(papers.filter_matched = @matched OR ${topicMatchedClause})`;
  }
  return `(papers.filter_matched = @matched AND NOT ${topicMatchedClause})`;
}

function toPaperParams(input: PaperInput & { id: string; createdAt?: string; updatedRecordAt: string }) {
  return {
    id: input.id,
    source: input.source,
    sourceId: input.sourceId,
    title: input.title,
    abstract: input.abstract,
    authorsJson: JSON.stringify(input.authors),
    categoriesJson: JSON.stringify(input.categories),
    primaryCategory: input.primaryCategory,
    publishedAt: input.publishedAt,
    updatedAt: input.updatedAt,
    sourceUrl: input.sourceUrl,
    pdfUrl: input.pdfUrl,
    createdAt: input.createdAt,
    updatedRecordAt: input.updatedRecordAt
  };
}

function mapPaper(row: PaperRow): Paper {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    title: row.title,
    abstract: row.abstract,
    authors: JSON.parse(row.authors_json) as string[],
    categories: JSON.parse(row.categories_json) as string[],
    primaryCategory: row.primary_category,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    sourceUrl: row.source_url,
    pdfUrl: row.pdf_url,
    status: row.status ?? "new",
    isFavorite: row.is_favorite === 1,
    userNote: row.user_note ?? "",
    filterMatched: row.filter_matched === null ? null : row.filter_matched === 1,
    filterScore: row.filter_score,
    filterMethod: row.filter_method,
    filterProfileHash: row.filter_profile_hash,
    filterCheckedAt: row.filter_checked_at,
    filterError: row.filter_error,
    analysisSummaryZh: row.analysis_summary_zh,
    analysisProblemZh: row.analysis_problem_zh,
    analysisMethodZh: row.analysis_method_zh,
    analysisContributionZh: row.analysis_contribution_zh,
    analysisDetailZh: row.analysis_detail_zh,
    analysisModel: row.analysis_model,
    analysisCheckedAt: row.analysis_checked_at,
    analysisError: row.analysis_error,
    pdfAnalysisOverviewZh: row.pdf_analysis_overview_zh,
    pdfAnalysisBackgroundZh: row.pdf_analysis_background_zh,
    pdfAnalysisProblemFormulationZh: row.pdf_analysis_problem_formulation_zh,
    pdfAnalysisMethodZh: row.pdf_analysis_method_zh,
    pdfAnalysisKeyIdeasZh: row.pdf_analysis_key_ideas_zh,
    pdfAnalysisExperimentsZh: row.pdf_analysis_experiments_zh,
    pdfAnalysisLimitationsZh: row.pdf_analysis_limitations_zh,
    pdfAnalysisReadingGuideZh: row.pdf_analysis_reading_guide_zh,
    pdfAnalysisAffiliations: row.pdf_analysis_affiliations,
    pdfAnalysisModel: row.pdf_analysis_model,
    pdfAnalysisCheckedAt: row.pdf_analysis_checked_at,
    pdfAnalysisError: row.pdf_analysis_error,
    keywordTags: parseKeywordTags(row.keyword_tags_json),
    userTags: parseUserTags(row.user_tags_json),
    topicMatches: parseTopicMatches(row.topic_matches_json),
    githubUrls: extractGithubUrls(row.abstract),
    createdAt: row.created_at,
    updatedRecordAt: row.updated_record_at
  };
}

function parseKeywordTags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return normalizeKeywordTags(parsed);
  } catch {
    return [];
  }
}

function normalizeKeywordTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const tag = item.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= 5) break;
  }
  return tags;
}

type UserTagRow = {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
};

function mapUserTag(row: UserTagRow): UserTag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseUserTags(value: string | null): UserTag[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isUserTag);
  } catch {
    return [];
  }
}

function parseTopicMatches(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPaperTopicMatch);
  } catch {
    return [];
  }
}

function isPaperTopicMatch(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.paperId === "string" &&
    typeof candidate.profileId === "string" &&
    typeof candidate.runId === "string" &&
    typeof candidate.profileSlug === "string" &&
    typeof candidate.profileLabel === "string" &&
    typeof candidate.publicTag === "string" &&
    (candidate.profileScore === null || typeof candidate.profileScore === "number") &&
    typeof candidate.matchedReason === "string" &&
    Array.isArray(candidate.matchedQueries) &&
    candidate.matchedQueries.every((item) => typeof item === "string") &&
    Array.isArray(candidate.discoveryChannels) &&
    candidate.discoveryChannels.every((item) => typeof item === "string") &&
    typeof candidate.canonicalPlatform === "string" &&
    typeof candidate.canonicalUrl === "string" &&
    candidate.externalIds !== null &&
    typeof candidate.externalIds === "object" &&
    !Array.isArray(candidate.externalIds) &&
    typeof candidate.dedupeKey === "string" &&
    typeof candidate.checkedAt === "string"
  );
}

function isUserTag(value: unknown): value is UserTag {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<UserTag>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.color === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

function normalizeUserTagName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("User tag name is required.");
  if (name.length > 32) throw new Error("User tag name must be 32 characters or fewer.");
  return name;
}

function normalizeUserTagColor(value: string): string {
  const color = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : "#2563eb";
}

function toDateBoundary(value: string, side: "start" | "end"): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T${side === "start" ? "00:00:00.000" : "23:59:59.999"}Z`;
  }
  return trimmed;
}
