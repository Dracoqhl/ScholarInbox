import type { SqliteDatabase } from "@/lib/db/database";
import { getAppDatabase } from "@/lib/db/app-database";
import { crawlArxivDateRange } from "@/lib/crawls/crawler";
import { getScheduledCrawlDateRange } from "@/lib/crawls/date-range";
import { createCrawlRepository } from "@/lib/crawls/repository";
import { createSettingsRepository } from "@/lib/settings/repository";

const SCHEDULER_INTERVAL_MS = 60_000;

type CrawlFunction = typeof crawlArxivDateRange;

export type DailyCrawlSchedulerState = {
  running: boolean;
  startedLocalDateKeys: Set<string>;
  timer: NodeJS.Timeout | null;
};

let schedulerState: DailyCrawlSchedulerState | null = null;

export function createDailyCrawlSchedulerState(): DailyCrawlSchedulerState {
  return {
    running: false,
    startedLocalDateKeys: new Set(),
    timer: null
  };
}

export function startDailyCrawlScheduler(input: {
  db?: SqliteDatabase;
  intervalMs?: number;
  state?: DailyCrawlSchedulerState;
  crawl?: CrawlFunction;
  now?: () => Date;
} = {}): DailyCrawlSchedulerState {
  if (process.env.SCHOLAR_INBOX_DISABLE_SCHEDULER === "1") {
    return input.state ?? schedulerState ?? createDailyCrawlSchedulerState();
  }

  if (schedulerState?.timer) return schedulerState;

  schedulerState = input.state ?? createDailyCrawlSchedulerState();
  const tick = () => {
    void runDailyCrawlSchedulerTick({
      db: input.db ?? getAppDatabase(),
      state: schedulerState as DailyCrawlSchedulerState,
      crawl: input.crawl,
      now: input.now?.() ?? new Date()
    });
  };

  tick();
  schedulerState.timer = setInterval(tick, input.intervalMs ?? SCHEDULER_INTERVAL_MS);
  schedulerState.timer.unref?.();
  return schedulerState;
}

export function stopDailyCrawlScheduler(): void {
  if (!schedulerState?.timer) return;
  clearInterval(schedulerState.timer);
  schedulerState.timer = null;
}

export async function runDailyCrawlSchedulerTick(input: {
  db: SqliteDatabase;
  state: DailyCrawlSchedulerState;
  now: Date;
  crawl?: CrawlFunction;
}): Promise<"started" | "skipped"> {
  if (input.state.running) return "skipped";

  const settings = await createSettingsRepository(input.db).get();
  if (formatLocalTime(input.now) !== settings.dailyCrawlTime) return "skipped";

  const localDateKey = toLocalDateInputValue(input.now);
  if (input.state.startedLocalDateKeys.has(localDateKey)) return "skipped";

  const range = getScheduledCrawlDateRange(input.now);
  if (await hasCompletedOrRunningCrawlForRange(input.db, range)) {
    input.state.startedLocalDateKeys.add(localDateKey);
    return "skipped";
  }

  input.state.running = true;
  input.state.startedLocalDateKeys.add(localDateKey);
  try {
    await (input.crawl ?? crawlArxivDateRange)({
      db: input.db,
      categories: settings.categories,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      trigger: "scheduled"
    });
    return "started";
  } finally {
    input.state.running = false;
  }
}

async function hasCompletedOrRunningCrawlForRange(db: SqliteDatabase, range: { dateFrom: string; dateTo: string }): Promise<boolean> {
  const runs = await createCrawlRepository(db).list();
  return runs.some((run) => (
    run.source === "arxiv" &&
    run.dateFrom === range.dateFrom &&
    run.dateTo === range.dateTo &&
    (run.status === "completed" || run.status === "running")
  ));
}

function formatLocalTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toLocalDateInputValue(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}
