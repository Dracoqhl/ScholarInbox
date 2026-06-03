import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

describe("research interest preferences", () => {
  const originalCwd = process.cwd();
  let dir: string | null = null;

  afterEach(() => {
    process.chdir(originalCwd);
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it("uses a narrow default profile when the local private preference file is absent", async () => {
    dir = mkdtempSync(join(tmpdir(), "scholar-inbox-preferences-test-"));
    process.chdir(dir);
    const { getPreferredKeywordTags, getResearchInterestProfile } = await import("../lib/user-preferences/research-interest");

    expect(getResearchInterestProfile()).toContain("LLM reasoning");
    expect(getResearchInterestProfile()).toContain("MCP/personal-app tools");
    expect(getPreferredKeywordTags()).toContain("GRPO");
  });
});
