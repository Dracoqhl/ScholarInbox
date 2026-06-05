import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDatabase } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";
import { createPaperRepository } from "@/lib/papers/repository";
import type { PaperInput } from "@/lib/papers/types";
import { createTopicSearchRepository } from "@/lib/topic-search/repository";

describe("topic search repository", () => {
  let dir: string;
  let databasePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "topic-search-repository-"));
    databasePath = join(dir, "test.sqlite");
    const db = getDatabase(databasePath);
    ensureDatabaseSchema(db);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("upserts profile metadata and records run logs", async () => {
    const repository = createTopicSearchRepository(getDatabase(databasePath));
    const profile = await repository.upsertProfile({
      slug: "opd",
      label: "OPD",
      publicTag: "OPD",
      filePath: "data/search-profiles/opd.md",
      dateFrom: "2023-01-01",
      dateTo: "2026-06-05",
      sources: ["arxiv", "semantic_scholar"],
      profileHash: "hash-a"
    });

    const run = await repository.startRun({
      profileId: profile.id,
      dateFrom: "2023-01-01",
      dateTo: "2026-06-05",
      sources: ["arxiv"]
    });
    await repository.appendRunLog(run.id, {
      level: "info",
      stage: "retrieving",
      message: "Fetching topic candidates.",
      details: { source: "arxiv" }
    });
    const finished = await repository.finishRun(run.id, {
      status: "completed",
      candidateCount: 10,
      dedupedCount: 8,
      acceptedCount: 3,
      insertedCount: 2,
      existingCount: 1
    });

    expect(finished.status).toBe("completed");
    expect(finished.logs).toHaveLength(1);
    expect(finished.logs[0]).toMatchObject({
      level: "info",
      stage: "retrieving",
      message: "Fetching topic candidates."
    });
    expect((await repository.listRuns({ limit: 1 }))[0].id).toBe(run.id);
  });

  it("upserts one topic match per paper and profile", async () => {
    const topicRepository = createTopicSearchRepository(getDatabase(databasePath));
    const paperRepository = createPaperRepository(getDatabase(databasePath));
    const profile = await topicRepository.upsertProfile({
      slug: "opd",
      label: "OPD",
      publicTag: "OPD",
      filePath: "data/search-profiles/opd.md",
      dateFrom: "2023-01-01",
      dateTo: "2026-06-05",
      sources: ["arxiv"],
      profileHash: "hash-a"
    });
    const run = await topicRepository.startRun({
      profileId: profile.id,
      dateFrom: "2023-01-01",
      dateTo: "2026-06-05",
      sources: ["arxiv"]
    });
    const { paper } = await paperRepository.upsert(makePaperInput({ sourceId: "2401.00123", title: "OPD for Reasoning" }));

    await topicRepository.upsertPaperMatch({
      paperId: paper.id,
      profileId: profile.id,
      runId: run.id,
      profileSlug: "opd",
      profileLabel: "OPD",
      publicTag: "OPD",
      profileScore: 0.88,
      matchedReason: "Policy distillation for reasoning.",
      matchedQueries: ["OPD"],
      discoveryChannels: ["arxiv_search", "semantic_scholar"],
      canonicalPlatform: "arxiv",
      canonicalUrl: "https://arxiv.org/abs/2401.00123",
      externalIds: { arxiv: "2401.00123", semanticScholar: "abc" },
      dedupeKey: "arxiv:2401.00123"
    });
    await topicRepository.upsertPaperMatch({
      paperId: paper.id,
      profileId: profile.id,
      runId: run.id,
      profileSlug: "opd",
      profileLabel: "OPD",
      publicTag: "OPD",
      profileScore: 0.92,
      matchedReason: "Updated score.",
      matchedQueries: ["OPD", "online policy distillation"],
      discoveryChannels: ["semantic_scholar"],
      canonicalPlatform: "arxiv",
      canonicalUrl: "https://arxiv.org/abs/2401.00123",
      externalIds: { arxiv: "2401.00123", semanticScholar: "abc" },
      dedupeKey: "arxiv:2401.00123"
    });

    const matches = await topicRepository.listPaperMatches(paper.id);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      profileSlug: "opd",
      profileLabel: "OPD",
      publicTag: "OPD",
      profileScore: 0.92,
      matchedReason: "Updated score.",
      discoveryChannels: ["semantic_scholar"],
      canonicalPlatform: "arxiv"
    });
  });
});

function makePaperInput(input: Partial<PaperInput> = {}): PaperInput {
  return {
    source: "arxiv",
    sourceId: "2401.00001",
    title: "A Paper",
    abstract: "A paper about LLM reasoning.",
    authors: ["Ada Lovelace"],
    categories: ["cs.AI"],
    primaryCategory: "cs.AI",
    publishedAt: "2026-06-01T00:00:00.000Z",
    updatedAt: null,
    sourceUrl: "https://arxiv.org/abs/2401.00001",
    pdfUrl: "https://arxiv.org/pdf/2401.00001",
    ...input
  };
}
