import { readFileSync } from "fs";
import { join } from "path";

const RESEARCH_INTEREST_PATH = join(process.cwd(), "docs", "user-preferences", "research-interest.md");

export function getResearchInterestProfile(): string {
  return readFileSync(RESEARCH_INTEREST_PATH, "utf8").trim();
}

export function getPreferredKeywordTags(): string[] {
  const profile = getResearchInterestProfile();
  const section = profile.match(/## Preferred Keyword Tags\s+([\s\S]*?)(?:\n## |\s*$)/)?.[1] ?? "";
  return section
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s+(.+?)\s*$/)?.[1]?.trim())
    .filter((tag): tag is string => Boolean(tag));
}
