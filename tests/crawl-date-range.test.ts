import { describe, expect, it } from "vitest";

import { getDefaultManualCrawlDateRange, getManualCrawlDateRangeForDays } from "../lib/crawls/date-range";

describe("crawl date range defaults", () => {
  it("defaults manual crawls to the last seven UTC dates", () => {
    expect(getDefaultManualCrawlDateRange(new Date("2026-06-02T07:00:00.000Z"))).toEqual({
      dateFrom: "2026-05-27",
      dateTo: "2026-06-02"
    });
  });

  it("builds preset ranges for recent days", () => {
    const now = new Date("2026-06-02T07:00:00.000Z");

    expect(getManualCrawlDateRangeForDays(1, now)).toEqual({
      dateFrom: "2026-06-02",
      dateTo: "2026-06-02"
    });
    expect(getManualCrawlDateRangeForDays(3, now)).toEqual({
      dateFrom: "2026-05-31",
      dateTo: "2026-06-02"
    });
    expect(getManualCrawlDateRangeForDays(7, now)).toEqual({
      dateFrom: "2026-05-27",
      dateTo: "2026-06-02"
    });
  });
});
