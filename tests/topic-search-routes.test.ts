import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDatabase, getDatabase } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";
import { createTopicSearchRepository } from "@/lib/topic-search/repository";
import { GET as GET_PROFILES } from "@/app/api/topic-search/profiles/route";
import { PATCH as PATCH_PROFILE } from "@/app/api/topic-search/profiles/[slug]/route";
import { GET as GET_RUNS } from "@/app/api/topic-search/runs/route";

describe("topic search routes", () => {
  const originalCwd = process.cwd();
  let dir: string;
  let databasePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "topic-search-routes-"));
    process.chdir(dir);
    databasePath = join(dir, "test.sqlite");
    process.env.DATABASE_PATH = databasePath;
    ensureDatabaseSchema(getDatabase(databasePath));
    mkdirSync(join(dir, "data", "search-profiles"), { recursive: true });
    writeFileSync(join(dir, "data", "search-profiles", "opd.md"), makeProfileMarkdown());
  });

  afterEach(() => {
    closeDatabase();
    delete process.env.DATABASE_PATH;
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists local topic profiles", async () => {
    const response = await GET_PROFILES();
    const payload = (await response.json()) as { profiles: Array<{ slug: string; label: string; publicTag: string }> };

    expect(response.status).toBe(200);
    expect(payload.profiles).toEqual([expect.objectContaining({ slug: "opd", label: "OPD", publicTag: "OPD" })]);
  });

  it("updates editable topic profile metadata", async () => {
    const response = await PATCH_PROFILE(
      new Request("http://localhost/api/topic-search/profiles/opd", {
        method: "PATCH",
        body: JSON.stringify({
          publicTag: "OPD Survey",
          dateFrom: "2024-01-01",
          dateTo: "2026-06-05",
          sources: ["arxiv"]
        })
      }),
      { params: { slug: "opd" } }
    );
    const payload = (await response.json()) as { profile: { publicTag: string; dateFrom: string; sources: string[] } };

    expect(response.status).toBe(200);
    expect(payload.profile).toMatchObject({ publicTag: "OPD Survey", dateFrom: "2024-01-01", sources: ["arxiv"] });
  });

  it("lists recent topic search runs for log restoration", async () => {
    const repository = createTopicSearchRepository(getDatabase(databasePath));
    const profile = await repository.upsertProfile({
      slug: "opd",
      label: "OPD",
      publicTag: "OPD",
      filePath: "data/search-profiles/opd.md",
      dateFrom: "2023-01-01",
      dateTo: "2026-06-05",
      sources: ["arxiv"],
      profileHash: "hash-a"
    });
    const run = await repository.startRun({
      profileId: profile.id,
      dateFrom: profile.dateFrom,
      dateTo: profile.dateTo,
      sources: ["arxiv"]
    });
    await repository.appendRunLog(run.id, { level: "info", stage: "retrieving", message: "Fetching." });

    const response = await GET_RUNS(new NextRequest("http://localhost/api/topic-search/runs?limit=1"));
    const payload = (await response.json()) as { runs: Array<{ id: string; logs: Array<{ message: string }> }> };

    expect(response.status).toBe(200);
    expect(payload.runs[0].id).toBe(run.id);
    expect(payload.runs[0].logs[0].message).toBe("Fetching.");
  });
});

function makeProfileMarkdown(): string {
  return `# OPD

slug: opd
label: OPD
publicTag: OPD
dateFrom: 2023-01-01
dateTo: 2026-06-05
sources:
  - arxiv
  - semantic_scholar

## Include

Policy distillation for LLM reasoning.

## Exclude

Multimodal work.

## Query Seeds

- OPD
- online policy distillation
`;
}
