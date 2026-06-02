import { readFileSync } from "node:fs";
import { join } from "node:path";

const RESEARCH_INTEREST_PATH = join(process.cwd(), "docs", "user-preferences", "research-interest.md");

export function getResearchInterestProfile(): string {
  return readFileSync(RESEARCH_INTEREST_PATH, "utf8").trim();
}
