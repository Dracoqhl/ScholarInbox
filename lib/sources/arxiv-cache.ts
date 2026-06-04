import type { SqliteDatabase } from "@/lib/db/database";
import type { PaperInput } from "@/lib/papers/types";

export function createArxivCacheRepository(db: SqliteDatabase) {
  return new ArxivCacheRepository(db);
}

class ArxivCacheRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async getPaper(sourceId: string): Promise<PaperInput | null> {
    const row = this.db
      .prepare("SELECT paper_json FROM arxiv_paper_cache WHERE source_id = @sourceId")
      .get<{ paper_json: string }>({ sourceId });
    if (!row) return null;
    try {
      return JSON.parse(row.paper_json) as PaperInput;
    } catch {
      return null;
    }
  }

  async setPaper(paper: PaperInput): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO arxiv_paper_cache (source_id, paper_json, fetched_at)
         VALUES (@sourceId, @paperJson, @fetchedAt)
         ON CONFLICT(source_id) DO UPDATE SET
           paper_json = excluded.paper_json,
           fetched_at = excluded.fetched_at`
      )
      .run({
        sourceId: paper.sourceId,
        paperJson: JSON.stringify(paper),
        fetchedAt: now
      });
  }

  async setPapers(papers: PaperInput[]): Promise<void> {
    for (const paper of papers) {
      await this.setPaper(paper);
    }
  }
}
