import { describe, expect, it } from "vitest";

import { extractGithubUrls } from "../lib/papers/github-links";

describe("GitHub link extraction", () => {
  it("extracts GitHub repository URLs from paper abstracts", () => {
    expect(extractGithubUrls("Code is available at https://github.com/example/project. See also https://github.com/example/project/blob/main/README.md")).toEqual([
      "https://github.com/example/project"
    ]);
  });
});
