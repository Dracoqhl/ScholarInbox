import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PATCH } from "../app/api/papers/[id]/note/route";
import { closeDatabase, getDatabase } from "../lib/db/database";
import { ensureDatabaseSchema } from "../lib/db/schema";
import { createPaperRepository } from "../lib/papers/repository";
import type { PaperInput } from "../lib/papers/types";

describe("paper note route", () => {
  let dir: string;
  let databasePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scholar-inbox-note-route-test-"));
    databasePath = join(dir, "test.sqlite");
    process.env.DATABASE_PATH = databasePath;
    const db = getDatabase(databasePath);
    ensureDatabaseSchema(db);
  });

  afterEach(() => {
    closeDatabase();
    delete process.env.DATABASE_PATH;
    rmSync(dir, { recursive: true, force: true });
  });

  it("updates a paper user note", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const { paper } = await repository.upsert(makePaperInput());

    const response = await PATCH(
      new Request(`http://localhost/api/papers/${paper.id}/note`, {
        method: "PATCH",
        body: JSON.stringify({ userNote: "收藏原因：这篇 GRPO 训练设置值得精读。" })
      }),
      { params: { id: paper.id } }
    );
    const payload = (await response.json()) as { paper: { userNote: string } };

    expect(response.status).toBe(200);
    expect(payload.paper.userNote).toBe("收藏原因：这篇 GRPO 训练设置值得精读。");
  });
});

function makePaperInput(overrides: Partial<PaperInput> = {}): PaperInput {
  return {
    source: "arxiv",
    sourceId: "2401.00201",
    title: "A paper about language model reasoning",
    abstract: "We study post-training and inference for large language models.",
    authors: ["Ada Lovelace"],
    categories: ["cs.CL"],
    primaryCategory: "cs.CL",
    publishedAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
    sourceUrl: "https://arxiv.org/abs/2401.00201",
    pdfUrl: "https://arxiv.org/pdf/2401.00201",
    ...overrides
  };
}
