import { randomUUID } from "node:crypto";

import type { SqliteDatabase } from "@/lib/db/database";
import { extractGithubUrls } from "@/lib/papers/github-links";
import type { Paper, PaperAnalysisResult, PaperDeleteFilters, PaperFilterResult, PaperInput, PaperListFilters, PaperRow, PaperStatus } from "@/lib/papers/types";

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
        `INSERT INTO paper_states (paper_id, status, is_favorite, updated_at)
         VALUES (@paperId, 'new', 0, @updatedAt)`
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

    if (filters.matched !== undefined) {
      where.push("papers.filter_matched = @matched");
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
      where.push("papers.filter_matched = @matched");
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
        updatedRecordAt: new Date().toISOString()
      });
    return this.get(id);
  }

  async setFavorite(id: string, isFavorite: boolean): Promise<Paper | null> {
    this.db
      .prepare("UPDATE paper_states SET is_favorite = @isFavorite, updated_at = @updatedAt WHERE paper_id = @id")
      .run({ id, isFavorite: isFavorite ? 1 : 0, updatedAt: new Date().toISOString() });
    return this.get(id);
  }

  async setStatus(id: string, status: PaperStatus): Promise<Paper | null> {
    this.db
      .prepare("UPDATE paper_states SET status = @status, updated_at = @updatedAt WHERE paper_id = @id")
      .run({ id, status, updatedAt: new Date().toISOString() });
    return this.get(id);
  }
}

function baseSelect(whereClause: string): string {
  return `
    SELECT papers.*, paper_states.status, paper_states.is_favorite
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
    githubUrls: extractGithubUrls(row.abstract),
    createdAt: row.created_at,
    updatedRecordAt: row.updated_record_at
  };
}
