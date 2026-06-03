#!/usr/bin/env node
import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { isAbsolute, resolve } from "path";
import { pathToFileURL } from "url";

const DEFAULT_DAILY_CRAWL_TIME = "08:00";
const DEFAULT_INTERVAL_MS = 15_000;

export function getScheduledCrawlDateRange(now = new Date()) {
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const previousLocalDate = new Date(localMidnight.getTime() - 24 * 60 * 60 * 1000);
  const value = toLocalDateInputValue(previousLocalDate);
  return { dateFrom: value, dateTo: value };
}

export function shouldRunScheduledCrawl(now, dailyCrawlTime) {
  return formatLocalTime(now) === dailyCrawlTime;
}

export async function runSchedulerTick(input) {
  if (input.state.running) return "skipped";

  const settings = readSettings(input.databasePath);
  if (!shouldRunScheduledCrawl(input.now, settings.dailyCrawlTime)) return "skipped";

  const localDateKey = toLocalDateInputValue(input.now);
  if (input.state.startedLocalDateKeys.has(localDateKey)) return "skipped";

  const range = getScheduledCrawlDateRange(input.now);
  if (hasCompletedOrRunningCrawlForRange(input.databasePath, range)) {
    input.state.startedLocalDateKeys.add(localDateKey);
    return "skipped";
  }

  input.state.running = true;
  input.state.startedLocalDateKeys.add(localDateKey);
  try {
    await triggerScheduledCrawl(input.baseUrl, range);
    return "started";
  } catch (error) {
    input.state.startedLocalDateKeys.delete(localDateKey);
    throw error;
  } finally {
    input.state.running = false;
  }
}

export function createSchedulerState() {
  return {
    running: false,
    startedLocalDateKeys: new Set()
  };
}

function readSettings(databasePath) {
  if (!existsSync(databasePath) || !tableExists(databasePath, "app_settings")) {
    return { dailyCrawlTime: DEFAULT_DAILY_CRAWL_TIME };
  }

  const rows = sqliteJson(databasePath, "SELECT key, value FROM app_settings;");
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return {
    dailyCrawlTime: typeof values.get("dailyCrawlTime") === "string"
      ? values.get("dailyCrawlTime")
      : DEFAULT_DAILY_CRAWL_TIME
  };
}

function hasCompletedOrRunningCrawlForRange(databasePath, range) {
  if (!existsSync(databasePath) || !tableExists(databasePath, "crawl_runs")) return false;

  const rows = sqliteJson(
    databasePath,
    `SELECT id FROM crawl_runs
     WHERE source = 'arxiv'
       AND date_from = ${sqlLiteral(range.dateFrom)}
       AND date_to = ${sqlLiteral(range.dateTo)}
       AND status IN ('completed', 'running')
     LIMIT 1;`
  );
  return rows.length > 0;
}

async function triggerScheduledCrawl(baseUrl, range) {
  const response = await fetch(`${baseUrl}/api/crawls/manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      trigger: "scheduled"
    })
  });

  if (!response.ok) {
    throw new Error(`Scheduled crawl request failed with HTTP ${response.status}.`);
  }

  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) console.log(`[scheduler] ${line}`);
    }
  }
  if (buffer.trim()) console.log(`[scheduler] ${buffer.trim()}`);
}

function tableExists(databasePath, tableName) {
  const rows = sqliteJson(
    databasePath,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${sqlLiteral(tableName)} LIMIT 1;`
  );
  return rows.length > 0;
}

function sqliteJson(databasePath, sql) {
  const output = execFileSync("sqlite3", ["-cmd", ".timeout 5000", "-json", databasePath, sql], {
    encoding: "utf8"
  }).trim();
  return output ? JSON.parse(output) : [];
}

function resolveDatabasePath(value = process.env.DATABASE_PATH) {
  const normalized = value?.trim();
  if (!normalized) return resolve(process.cwd(), "data", "scholar-inbox.sqlite");
  if (!isAbsolute(normalized)) throw new Error("DATABASE_PATH must be an absolute path.");
  return normalized;
}

function resolveBaseUrl() {
  if (process.env.SCHOLAR_INBOX_BASE_URL) return process.env.SCHOLAR_INBOX_BASE_URL.replace(/\/$/, "");
  const port = process.env.PORT || "3120";
  const host = process.env.BIND_HOST && process.env.BIND_HOST !== "0.0.0.0" ? process.env.BIND_HOST : "127.0.0.1";
  return `http://${host}:${port}`;
}

function formatLocalTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toLocalDateInputValue(date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function main() {
  if (process.env.SCHOLAR_INBOX_DISABLE_SCHEDULER === "1") {
    console.log("[scheduler] disabled by SCHOLAR_INBOX_DISABLE_SCHEDULER=1");
    return;
  }

  const state = createSchedulerState();
  const databasePath = resolveDatabasePath();
  const baseUrl = resolveBaseUrl();
  const intervalMs = Number(process.env.SCHOLAR_INBOX_SCHEDULER_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  console.log(`[scheduler] watching ${databasePath}; target ${baseUrl}`);

  const tick = async () => {
    try {
      const result = await runSchedulerTick({
        state,
        databasePath,
        baseUrl,
        now: new Date()
      });
      if (result === "started") console.log("[scheduler] scheduled crawl started");
    } catch (error) {
      console.error(`[scheduler] ${error instanceof Error ? error.message : "scheduled crawl failed"}`);
    }
  };

  await tick();
  setInterval(tick, Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_INTERVAL_MS);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
