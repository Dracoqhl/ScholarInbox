import { createHash } from "node:crypto";

export const TOPIC_SEARCH_SOURCES = ["arxiv", "semantic_scholar", "openreview"] as const;

export type TopicSearchSource = (typeof TOPIC_SEARCH_SOURCES)[number];

export type TopicSearchProfile = {
  filePath: string;
  slug: string;
  label: string;
  publicTag: string;
  dateFrom: string;
  dateTo: string;
  sources: TopicSearchSource[];
  querySeeds: string[];
  includeText: string;
  excludeText: string;
  body: string;
  rawMarkdown: string;
  profileHash: string;
};

export function parseTopicSearchProfile(filePath: string, markdown: string): TopicSearchProfile {
  const metadata = parseMetadata(markdown);
  const slug = metadata.get("slug")?.trim();
  if (!slug) throw new Error("Topic profile slug is required.");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error("Topic profile slug must use lowercase letters, numbers, and hyphens.");

  const label = metadata.get("label")?.trim() || slug;
  const publicTag = metadata.get("publicTag")?.trim() || label;
  const dateFrom = metadata.get("dateFrom")?.trim();
  const dateTo = metadata.get("dateTo")?.trim();
  if (!dateFrom) throw new Error("Topic profile dateFrom is required.");
  if (!dateTo) throw new Error("Topic profile dateTo is required.");
  assertIsoDate(dateFrom, "dateFrom");
  assertIsoDate(dateTo, "dateTo");
  if (dateFrom > dateTo) throw new Error("Topic profile dateFrom must be before or equal to dateTo.");

  const sources = parseSources(metadata.get("sources") ?? "");
  const sections = parseSections(markdown);
  const querySeeds = parseBulletList(sections.get("query seeds") ?? "");
  if (!querySeeds.length) throw new Error("Topic profile must include at least one query seed.");

  const body = markdown.trim();
  const profileHash = createHash("sha256").update(normalizeProfileForHash(body)).digest("hex");

  return {
    filePath,
    slug,
    label,
    publicTag,
    dateFrom,
    dateTo,
    sources,
    querySeeds,
    includeText: (sections.get("include") ?? "").trim(),
    excludeText: (sections.get("exclude") ?? "").trim(),
    body,
    rawMarkdown: markdown,
    profileHash
  };
}

function parseMetadata(markdown: string): Map<string, string> {
  const metadata = new Map<string, string>();
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().startsWith("## ")) break;
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, inlineValue] = match;
    const listValues: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const listMatch = /^\s*-\s+(.+?)\s*$/.exec(lines[cursor]);
      if (!listMatch) break;
      listValues.push(listMatch[1]);
      cursor += 1;
    }
    if (listValues.length) {
      metadata.set(key, listValues.join(","));
      index = cursor - 1;
    } else {
      metadata.set(key, inlineValue.trim());
    }
  }
  return metadata;
}

function parseSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = markdown.split(/\r?\n/);
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentTitle) sections.set(currentTitle, currentLines.join("\n"));
  };

  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      currentTitle = match[1].trim().toLowerCase();
      currentLines = [];
      continue;
    }
    if (currentTitle) currentLines.push(line);
  }
  flush();
  return sections;
}

function parseSources(value: string): TopicSearchSource[] {
  const sources = value
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean);
  if (!sources.length) throw new Error("Topic profile must include at least one source.");
  for (const source of sources) {
    if (!isTopicSearchSource(source)) throw new Error(`Unsupported topic search source: ${source}`);
  }
  return sources as TopicSearchSource[];
}

function isTopicSearchSource(value: string): value is TopicSearchSource {
  return (TOPIC_SEARCH_SOURCES as readonly string[]).includes(value);
}

function parseBulletList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => /^\s*-\s+(.+?)\s*$/.exec(line)?.[1]?.trim() ?? "")
    .filter(Boolean);
}

function assertIsoDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime())) {
    throw new Error(`Topic profile ${field} must use YYYY-MM-DD.`);
  }
}

function normalizeProfileForHash(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}
