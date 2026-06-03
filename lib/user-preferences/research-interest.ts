import { existsSync, readFileSync } from "fs";
import { join } from "path";

const RESEARCH_INTEREST_PATH = join(process.cwd(), "docs", "user-preferences", "research-interest.md");
const DEFAULT_RESEARCH_INTEREST_PROFILE = [
  "# Research Interest Profile",
  "",
  "## Summary",
  "",
  "The user focuses on large language models for text/code/math reasoning, abstract decision-making, post-training, and agentic reasoning methods.",
  "",
  "## Always Include",
  "",
  "- LLM reasoning for mathematics, coding, formal reasoning, algorithmic reasoning, symbolic reasoning, and multi-step problem solving.",
  "- Test-time scaling, search, planning, verification, self-correction, verifier-guided decoding, and process supervision for LLM reasoning.",
  "- LLM post-training for reasoning or decision-making, including SFT, RL, RLHF, DPO, RLAIF, RLVR, reward models, process rewards, and verifiable rewards.",
  "- LLM agents only when the core contribution is a broadly useful architecture, memory module, planning method, reflection method, or agentic RL method for text/code/math/formal/decision tasks.",
  "",
  "## Preferred Keyword Tags",
  "",
  "- RLHF",
  "- DPO",
  "- GRPO",
  "- RLVR",
  "- Agentic RL",
  "- Process Reward",
  "- Verifier",
  "- Test-Time Scaling",
  "- Planning",
  "- Code Reasoning",
  "- Math Reasoning",
  "- Formal Reasoning",
  "- Agent Memory",
  "",
  "## Exclude",
  "",
  "- Multimodal, vision-language, embodied, robotics, medical/clinical, multilingual-only, or traditional non-LLM decision-making work.",
  "- Domain-specific agents, MCP/personal-app tools, web browsing agents, search/retrieval agents, agent monitoring/safety/auditing, and benchmark-only agent papers unless they directly introduce a general reasoning or post-training method.",
  "- Pure efficiency, compression, quantization, serving, systems, or inference acceleration papers unless the central contribution is a test-time reasoning strategy."
].join("\n");

export function getResearchInterestProfile(): string {
  if (!existsSync(RESEARCH_INTEREST_PATH)) {
    return DEFAULT_RESEARCH_INTEREST_PROFILE;
  }
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
