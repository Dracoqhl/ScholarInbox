import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET, POST } from "../app/api/user-tags/route";
import { GET as GET_PAPERS } from "../app/api/papers/route";
import { PATCH } from "../app/api/papers/[id]/user-tags/route";
import { closeDatabase, getDatabase } from "../lib/db/database";
import { ensureDatabaseSchema } from "../lib/db/schema";
import { createPaperRepository } from "../lib/papers/repository";
import type { PaperInput } from "../lib/papers/types";

describe("user tag routes", () => {
  let dir: string;
  let databasePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scholar-inbox-user-tags-route-test-"));
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

  it("creates user tags and assigns multiple tags to a paper", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const { paper } = await repository.upsert(makePaperInput());

    const firstResponse = await POST(
      new Request("http://localhost/api/user-tags", {
        method: "POST",
        body: JSON.stringify({ name: "推理后训练", color: "#2563eb" })
      })
    );
    const secondResponse = await POST(
      new Request("http://localhost/api/user-tags", {
        method: "POST",
        body: JSON.stringify({ name: "Agent 架构", color: "#16a34a" })
      })
    );
    const first = (await firstResponse.json()) as { tag: { id: string } };
    const second = (await secondResponse.json()) as { tag: { id: string } };

    const assignResponse = await PATCH(
      new Request(`http://localhost/api/papers/${paper.id}/user-tags`, {
        method: "PATCH",
        body: JSON.stringify({ tagIds: [first.tag.id, second.tag.id] })
      }),
      { params: { id: paper.id } }
    );
    const assigned = (await assignResponse.json()) as { paper: { userTags: Array<{ name: string }> } };
    const listResponse = await GET();
    const listed = (await listResponse.json()) as { tags: Array<{ name: string }> };

    expect(assignResponse.status).toBe(200);
    expect(assigned.paper.userTags.map((tag) => tag.name).sort()).toEqual(["Agent 架构", "推理后训练"]);
    expect(listed.tags.map((tag) => tag.name).sort()).toEqual(["Agent 架构", "推理后训练"]);
  });

  it("filters papers that match all repeated user tag query parameters", async () => {
    const repository = createPaperRepository(getDatabase(databasePath));
    const first = await repository.createUserTag({ name: "推理后训练", color: "#2563eb" });
    const second = await repository.createUserTag({ name: "Agent 架构", color: "#16a34a" });
    const both = await repository.upsert(makePaperInput({ sourceId: "2401.00302", title: "Both tags" }));
    const one = await repository.upsert(makePaperInput({ sourceId: "2401.00303", title: "One tag" }));
    await repository.setStatus(both.paper.id, "archived");
    await repository.setStatus(one.paper.id, "archived");
    await repository.setUserTags(both.paper.id, [first.id, second.id]);
    await repository.setUserTags(one.paper.id, [second.id]);

    const response = await GET_PAPERS(
      new NextRequest(`http://localhost/api/papers?matched=all&status=archived&userTagId=${first.id}&userTagId=${second.id}`)
    );
    const payload = (await response.json()) as { papers: Array<{ title: string }> };

    expect(payload.papers.map((paper) => paper.title)).toEqual(["Both tags"]);
  });
});

function makePaperInput(overrides: Partial<PaperInput> = {}): PaperInput {
  return {
    source: "arxiv",
    sourceId: "2401.00301",
    title: "A paper about language model reasoning",
    abstract: "We study post-training and inference for large language models.",
    authors: ["Ada Lovelace"],
    categories: ["cs.CL"],
    primaryCategory: "cs.CL",
    publishedAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
    sourceUrl: "https://arxiv.org/abs/2401.00301",
    pdfUrl: "https://arxiv.org/pdf/2401.00301",
    ...overrides
  };
}
