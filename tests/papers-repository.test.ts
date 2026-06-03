import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDatabase } from "../lib/db/database";
import { ensureDatabaseSchema } from "../lib/db/schema";
import { createPaperRepository } from "../lib/papers/repository";
import type { PaperInput } from "../lib/papers/types";

describe("paper repository", () => {
  let dir: string;
  let databasePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scholar-inbox-test-"));
    databasePath = join(dir, "test.sqlite");
    const db = getDatabase(databasePath);
    ensureDatabaseSchema(db);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("deduplicates papers by source and source id", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const input = makePaperInput({ title: "Original title" });

    const first = await repository.upsert(input);
    const second = await repository.upsert({ ...input, title: "Updated title" });
    const papers = await repository.list({});

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.paper.id).toBe(first.paper.id);
    expect(papers).toHaveLength(1);
    expect(papers[0].title).toBe("Updated title");
  });

  it("archives a paper when it is favorited", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const { paper } = await repository.upsert(makePaperInput({ sourceId: "2401.00002" }));

    await repository.setFavorite(paper.id, true);

    const updated = await repository.get(paper.id);

    expect(updated?.isFavorite).toBe(true);
    expect(updated?.status).toBe("archived");
  });

  it("persists papers marked as irrelevant to the research direction", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const { paper } = await repository.upsert(makePaperInput({ sourceId: "2401.00008" }));

    await repository.setStatus(paper.id, "irrelevant");

    expect((await repository.get(paper.id))?.status).toBe("irrelevant");
  });

  it("persists skipped papers without keeping them favorited", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const { paper } = await repository.upsert(makePaperInput({ sourceId: "2401.00014" }));

    await repository.setFavorite(paper.id, true);
    await repository.setStatus(paper.id, "skipped");

    expect(await repository.get(paper.id)).toMatchObject({
      status: "skipped",
      isFavorite: false
    });
  });

  it("normalizes legacy reading states to archived", async () => {
    const db = getDatabase(databasePath);
    const repository = createPaperRepository(db);
    const { paper } = await repository.upsert(makePaperInput({ sourceId: "2401.00120" }));

    db.exec(`
      DROP TABLE paper_states;
      CREATE TABLE paper_states (
        paper_id TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('new', 'general', 'interested', 'reading', 'done', 'archived', 'irrelevant')),
        is_favorite INTEGER NOT NULL,
        user_note TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );
    `);
    db
      .prepare("INSERT INTO paper_states (paper_id, status, is_favorite, user_note, updated_at) VALUES (@id, 'reading', 0, '', @updatedAt)")
      .run({ id: paper.id, updatedAt: "2026-06-02T00:00:00.000Z" });

    ensureDatabaseSchema(db);

    expect((await repository.get(paper.id))?.status).toBe("archived");
  });

  it("creates custom user tags, assigns multiple tags, and filters archived papers by tag and date", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const reasoning = await repository.createUserTag({ name: "推理后训练", color: "#2563eb" });
    const agent = await repository.createUserTag({ name: "Agent 架构", color: "#16a34a" });
    const target = await repository.upsert(makePaperInput({ sourceId: "2401.00120", title: "Target", publishedAt: "2026-06-02T08:00:00.000Z" }));
    const other = await repository.upsert(makePaperInput({ sourceId: "2401.00121", title: "Other", publishedAt: "2026-05-01T08:00:00.000Z" }));

    await repository.setStatus(target.paper.id, "archived");
    await repository.setStatus(other.paper.id, "archived");
    await repository.setUserTags(target.paper.id, [reasoning.id, agent.id]);
    await repository.setUserTags(other.paper.id, [agent.id]);

    const papers = await repository.list({
      status: "archived",
      userTagIds: [reasoning.id],
      publishedFrom: "2026-06-01",
      publishedTo: "2026-06-30"
    });

    expect(papers.map((paper) => paper.title)).toEqual(["Target"]);
    expect(papers[0].userTags.map((tag) => tag.name).sort()).toEqual(["Agent 架构", "推理后训练"]);
  });

  it("persists a user note for a paper", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const { paper } = await repository.upsert(makePaperInput({ sourceId: "2401.00140" }));

    await repository.setUserNote(paper.id, "方向无关原因：主要是视觉语言任务。");

    expect(await repository.get(paper.id)).toMatchObject({
      userNote: "方向无关原因：主要是视觉语言任务。"
    });
  });

  it("can list only favorited papers", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const first = await repository.upsert(makePaperInput({ sourceId: "2401.00003", title: "Favorite" }));
    await repository.upsert(makePaperInput({ sourceId: "2401.00004", title: "Plain" }));
    await repository.setFavorite(first.paper.id, true);

    const favorites = await repository.list({ favorite: true });

    expect(favorites.map((paper) => paper.title)).toEqual(["Favorite"]);
  });

  it("lists only matched papers when requested", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const matched = await repository.upsert(makePaperInput({ sourceId: "2401.00005", title: "Matched" }));
    const unmatched = await repository.upsert(makePaperInput({ sourceId: "2401.00006", title: "Unmatched" }));

    await repository.setFilterResult(matched.paper.id, {
      matched: true,
      score: 0.91,
      method: "llm",
      profileHash: "profile-a",
      checkedAt: "2026-06-02T00:00:00.000Z",
      error: null
    });
    await repository.setFilterResult(unmatched.paper.id, {
      matched: false,
      score: 0.08,
      method: "prefilter",
      profileHash: "profile-a",
      checkedAt: "2026-06-02T00:00:00.000Z",
      error: null
    });

    const papers = await repository.list({ matched: true });

    expect(papers.map((paper) => paper.title)).toEqual(["Matched"]);
    expect(papers[0]).toMatchObject({
      filterMatched: true,
      filterScore: 0.91,
      filterMethod: "llm",
      filterProfileHash: "profile-a"
    });
  });

  it("orders matched papers by filter score before publication date", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const low = await repository.upsert(makePaperInput({ sourceId: "2401.00009", title: "Low score", publishedAt: "2026-01-03T00:00:00.000Z" }));
    const high = await repository.upsert(makePaperInput({ sourceId: "2401.00010", title: "High score", publishedAt: "2026-01-01T00:00:00.000Z" }));

    await repository.setFilterResult(low.paper.id, {
      matched: true,
      score: 0.71,
      method: "llm",
      profileHash: "profile-a",
      checkedAt: "2026-06-02T00:00:00.000Z",
      error: null
    });
    await repository.setFilterResult(high.paper.id, {
      matched: true,
      score: 0.96,
      method: "llm",
      profileHash: "profile-a",
      checkedAt: "2026-06-02T00:00:00.000Z",
      error: null
    });

    expect((await repository.list({ matched: true })).map((paper) => paper.title)).toEqual(["High score", "Low score"]);
  });

  it("deletes only new matched papers selected for inbox cleanup", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const newMatched = await repository.upsert(makePaperInput({ sourceId: "2401.00011", title: "Delete me" }));
    const interestedMatched = await repository.upsert(makePaperInput({ sourceId: "2401.00012", title: "Keep interested" }));
    const newUnmatched = await repository.upsert(makePaperInput({ sourceId: "2401.00013", title: "Keep unmatched" }));

    await repository.setStatus(interestedMatched.paper.id, "archived");
    await repository.setFilterResult(newMatched.paper.id, makeFilterResult(true, 0.9));
    await repository.setFilterResult(interestedMatched.paper.id, makeFilterResult(true, 0.8));
    await repository.setFilterResult(newUnmatched.paper.id, makeFilterResult(false, 0.1));

    const result = await repository.deleteMany({ status: "new", matched: true });

    expect(result.deletedCount).toBe(1);
    expect((await repository.list({})).map((paper) => paper.title).sort()).toEqual(["Keep interested", "Keep unmatched"]);
  });

  it("finds an existing filter result for the current interest profile", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const { paper } = await repository.upsert(makePaperInput({ sourceId: "2401.00007" }));
    await repository.setFilterResult(paper.id, {
      matched: true,
      score: 0.8,
      method: "llm",
      profileHash: "profile-a",
      checkedAt: "2026-06-02T00:00:00.000Z",
      error: null
    });

    const cached = await repository.getCurrentFilterResult("arxiv", "2401.00007", "profile-a");
    const stale = await repository.getCurrentFilterResult("arxiv", "2401.00007", "profile-b");

    expect(cached).toMatchObject({ matched: true, profileHash: "profile-a" });
    expect(stale).toBeNull();
  });

  it("persists compact keyword tags from paper analysis", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const { paper } = await repository.upsert(makePaperInput({ sourceId: "2401.00130" }));

    await repository.setAnalysisResult(paper.id, {
      summaryZh: "这篇论文研究 GRPO 后训练如何提升数学推理。",
      problemZh: "它要解决可验证奖励下的策略优化稳定性问题。",
      methodZh: "它使用 GRPO 和过程奖励训练推理模型。",
      contributionZh: "主要贡献是改进推理后训练流程。",
      detailZh: "详细解释背景、方法和实验。",
      keywordTags: ["GRPO", "RLVR", "Math Reasoning"],
      model: "test-analysis-model",
      checkedAt: "2026-06-02T00:00:00.000Z",
      error: null
    });

    expect(await repository.get(paper.id)).toMatchObject({
      keywordTags: ["GRPO", "RLVR", "Math Reasoning"]
    });
  });
});

function makePaperInput(overrides: Partial<PaperInput> = {}): PaperInput {
  return {
    source: "arxiv",
    sourceId: "2401.00001",
    title: "A paper about language model reasoning",
    abstract: "We study post-training and inference for large language models.",
    authors: ["Ada Lovelace", "Alan Turing"],
    categories: ["cs.CL", "cs.AI"],
    primaryCategory: "cs.CL",
    publishedAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
    sourceUrl: "https://arxiv.org/abs/2401.00001",
    pdfUrl: "https://arxiv.org/pdf/2401.00001",
    ...overrides
  };
}

function makeFilterResult(matched: boolean, score: number) {
  return {
    matched,
    score,
    method: "llm" as const,
    profileHash: "profile-a",
    checkedAt: "2026-06-02T00:00:00.000Z",
    error: null
  };
}
