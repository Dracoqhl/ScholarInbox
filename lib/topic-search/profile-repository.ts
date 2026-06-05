import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { parseTopicSearchProfile, type TopicSearchProfile, type TopicSearchSource } from "@/lib/topic-search/profile";

export type TopicProfileRepository = ReturnType<typeof createTopicProfileRepository>;

export type TopicProfileRepositoryOptions = {
  rootDir?: string;
};

export type TopicProfileMetadataUpdate = {
  publicTag: string;
  dateFrom: string;
  dateTo: string;
  sources: TopicSearchSource[];
};

export function createTopicProfileRepository(options: TopicProfileRepositoryOptions = {}) {
  const rootDir = options.rootDir ?? resolve(process.cwd(), "data", "search-profiles");

  return {
    list(): TopicSearchProfile[] {
      ensureDefaultProfiles(rootDir);
      return readdirSync(rootDir)
        .filter((fileName) => fileName.endsWith(".md"))
        .map((fileName) => readProfile(join(rootDir, fileName)))
        .sort((left, right) => left.label.localeCompare(right.label));
    },

    get(slug: string): TopicSearchProfile | null {
      return this.list().find((profile) => profile.slug === slug) ?? null;
    },

    saveMetadata(slug: string, update: TopicProfileMetadataUpdate): TopicSearchProfile {
      const profile = this.get(slug);
      if (!profile) throw new Error(`Topic profile not found: ${slug}`);
      const nextMarkdown = replaceMetadata(profile.rawMarkdown, {
        publicTag: update.publicTag,
        dateFrom: update.dateFrom,
        dateTo: update.dateTo,
        sources: update.sources
      });
      mkdirSync(rootDir, { recursive: true });
      writeFileSync(profile.filePath, nextMarkdown);
      return readProfile(profile.filePath);
    }
  };
}

function ensureDefaultProfiles(rootDir: string): void {
  mkdirSync(rootDir, { recursive: true });
  const hasProfiles = readdirSync(rootDir).some((fileName) => fileName.endsWith(".md"));
  if (hasProfiles) return;
  writeFileSync(join(rootDir, "opd.md"), DEFAULT_OPD_PROFILE);
}

const DEFAULT_OPD_PROFILE = `# OPD

slug: opd
label: OPD
publicTag: OPD
dateFrom: 2023-01-01
dateTo: 2026-06-05
sources:
  - arxiv
  - semantic_scholar

## Include

Papers about OPD and closely related policy distillation, preference distillation, post-training, reinforcement learning, and reasoning methods for language models.

## Exclude

Multimodal, embodied, robotics, medical, and traditional non-LLM reinforcement learning work.

## Query Seeds

- OPD
- online policy distillation
- off-policy distillation
- policy distillation
- preference distillation
- policy distillation language model
`;

function readProfile(filePath: string): TopicSearchProfile {
  return parseTopicSearchProfile(filePath, readFileSync(filePath, "utf8"));
}

function replaceMetadata(markdown: string, update: TopicProfileMetadataUpdate): string {
  const lines = markdown.split(/\r?\n/);
  const firstSectionIndex = lines.findIndex((line) => line.trim().startsWith("## "));
  const metadataEnd = firstSectionIndex === -1 ? lines.length : firstSectionIndex;
  const metadataLines = lines.slice(0, metadataEnd);
  const bodyLines = lines.slice(metadataEnd);
  const nextMetadata = replaceScalarMetadata(metadataLines, "publicTag", update.publicTag);
  const withDateFrom = replaceScalarMetadata(nextMetadata, "dateFrom", update.dateFrom);
  const withDateTo = replaceScalarMetadata(withDateFrom, "dateTo", update.dateTo);
  const withSources = replaceSourcesMetadata(withDateTo, update.sources);
  return [...withSources, ...bodyLines].join("\n");
}

function replaceScalarMetadata(lines: string[], key: string, value: string): string[] {
  const index = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (index === -1) return [...lines, `${key}: ${value}`];
  return lines.map((line, lineIndex) => (lineIndex === index ? `${key}: ${value}` : line));
}

function replaceSourcesMetadata(lines: string[], sources: TopicSearchSource[]): string[] {
  const index = lines.findIndex((line) => line.startsWith("sources:"));
  const rendered = ["sources:", ...sources.map((source) => `  - ${source}`)];
  if (index === -1) return [...lines, ...rendered];

  let endIndex = index + 1;
  while (endIndex < lines.length && /^\s*-\s+/.test(lines[endIndex])) {
    endIndex += 1;
  }
  return [...lines.slice(0, index), ...rendered, ...lines.slice(endIndex)];
}
