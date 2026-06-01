const DEFAULT_MANUAL_CRAWL_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getDefaultManualCrawlDateRange(now = new Date()): { dateFrom: string; dateTo: string } {
  const dateTo = toUtcDateInputValue(now);
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (DEFAULT_MANUAL_CRAWL_DAYS - 1) * MS_PER_DAY);
  return {
    dateFrom: toUtcDateInputValue(from),
    dateTo
  };
}

function toUtcDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}
