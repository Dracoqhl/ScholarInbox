const DEFAULT_MANUAL_CRAWL_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getDefaultManualCrawlDateRange(now = new Date()): { dateFrom: string; dateTo: string } {
  return getManualCrawlDateRangeForDays(DEFAULT_MANUAL_CRAWL_DAYS, now);
}

export function getManualCrawlDateRangeForDays(days: number, now = new Date()): { dateFrom: string; dateTo: string } {
  const dateTo = toUtcDateInputValue(now);
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * MS_PER_DAY);
  return {
    dateFrom: toUtcDateInputValue(from),
    dateTo
  };
}

export function getScheduledCrawlDateRange(now = new Date()): { dateFrom: string; dateTo: string } {
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const previousLocalDate = new Date(localMidnight.getTime() - MS_PER_DAY);
  const value = toLocalDateInputValue(previousLocalDate);
  return {
    dateFrom: value,
    dateTo: value
  };
}

function toUtcDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toLocalDateInputValue(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}
