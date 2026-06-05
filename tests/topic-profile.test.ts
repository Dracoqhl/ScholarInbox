import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseTopicSearchProfile } from "@/lib/topic-search/profile";
import { createTopicProfileRepository } from "@/lib/topic-search/profile-repository";

describe("topic search profile parser", () => {
  it("parses metadata and query sections from markdown", () => {
    const profile = parseTopicSearchProfile("data/search-profiles/opd.md", `# OPD

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
`);

    expect(profile.slug).toBe("opd");
    expect(profile.label).toBe("OPD");
    expect(profile.publicTag).toBe("OPD");
    expect(profile.dateFrom).toBe("2023-01-01");
    expect(profile.dateTo).toBe("2026-06-05");
    expect(profile.sources).toEqual(["arxiv", "semantic_scholar"]);
    expect(profile.querySeeds).toEqual(["OPD", "online policy distillation"]);
    expect(profile.body).toContain("Policy distillation");
    expect(profile.profileHash).toHaveLength(64);
  });

  it("rejects profiles without a stable slug", () => {
    expect(() => parseTopicSearchProfile("bad.md", "# Bad\n\nlabel: Bad")).toThrow("Topic profile slug is required.");
  });
});

describe("topic profile file repository", () => {
  let dir: string;
  let rootDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "topic-profile-repository-"));
    rootDir = join(dir, "data", "search-profiles");
    mkdirSync(rootDir, { recursive: true });
    writeFileSync(join(rootDir, "opd.md"), makeProfileMarkdown({ slug: "opd", label: "OPD", publicTag: "OPD" }));
    writeFileSync(join(rootDir, "agentic-rl.md"), makeProfileMarkdown({ slug: "agentic-rl", label: "Agentic RL", publicTag: "Agentic RL" }));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists profiles sorted by label", () => {
    const repository = createTopicProfileRepository({ rootDir });

    const profiles = repository.list();

    expect(profiles.map((profile) => profile.label)).toEqual(["Agentic RL", "OPD"]);
    expect(profiles.map((profile) => profile.slug)).toEqual(["agentic-rl", "opd"]);
  });

  it("creates a local default OPD profile when the profile directory is empty", () => {
    rmSync(rootDir, { recursive: true, force: true });
    const repository = createTopicProfileRepository({ rootDir });

    const profiles = repository.list();

    expect(profiles.map((profile) => profile.slug)).toEqual(["opd"]);
    expect(readFileSync(join(rootDir, "opd.md"), "utf8")).toContain("online policy distillation");
  });

  it("returns one profile by slug", () => {
    const repository = createTopicProfileRepository({ rootDir });

    const profile = repository.get("opd");

    expect(profile?.publicTag).toBe("OPD");
    expect(profile?.querySeeds).toContain("online policy distillation");
  });

  it("updates editable metadata without replacing profile requirements", () => {
    const repository = createTopicProfileRepository({ rootDir });

    const updated = repository.saveMetadata("opd", {
      dateFrom: "2024-01-01",
      dateTo: "2026-06-05",
      sources: ["arxiv"],
      publicTag: "OPD Survey"
    });

    const saved = readFileSync(join(rootDir, "opd.md"), "utf8");
    expect(updated.dateFrom).toBe("2024-01-01");
    expect(updated.sources).toEqual(["arxiv"]);
    expect(updated.publicTag).toBe("OPD Survey");
    expect(saved).toContain("## Include");
    expect(saved).toContain("Policy distillation for LLM reasoning.");
  });
});

function makeProfileMarkdown(input: { slug: string; label: string; publicTag: string }): string {
  return `# ${input.label}

slug: ${input.slug}
label: ${input.label}
publicTag: ${input.publicTag}
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
