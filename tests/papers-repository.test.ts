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

  it("persists favorite state and reading status independently", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const { paper } = await repository.upsert(makePaperInput({ sourceId: "2401.00002" }));

    await repository.setFavorite(paper.id, true);
    await repository.setStatus(paper.id, "done");

    const updated = await repository.get(paper.id);

    expect(updated?.isFavorite).toBe(true);
    expect(updated?.status).toBe("done");
  });

  it("can list only favorited papers", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const first = await repository.upsert(makePaperInput({ sourceId: "2401.00003", title: "Favorite" }));
    await repository.upsert(makePaperInput({ sourceId: "2401.00004", title: "Plain" }));
    await repository.setFavorite(first.paper.id, true);

    const favorites = await repository.list({ favorite: true });

    expect(favorites.map((paper) => paper.title)).toEqual(["Favorite"]);
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
