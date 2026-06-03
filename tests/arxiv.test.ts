import { describe, expect, it, vi } from "vitest";

import { buildArxivQueryUrl, fetchArxivPapers, parseArxivFeed, resetArxivRateLimitForTests } from "../lib/sources/arxiv";

describe("arXiv source", () => {
  it("parses Atom entries into normalized paper inputs", () => {
    const papers = parseArxivFeed(`
      <?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <id>http://arxiv.org/abs/2401.00001v2</id>
          <updated>2024-01-02T03:04:05Z</updated>
          <published>2024-01-01T01:02:03Z</published>
          <title>  Language Model Reasoning
            After Post-Training </title>
          <summary> We study inference and post-training. </summary>
          <author><name>Ada Lovelace</name></author>
          <author><name>Alan Turing</name></author>
          <link href="http://arxiv.org/abs/2401.00001v2" rel="alternate" type="text/html"/>
          <link title="pdf" href="http://arxiv.org/pdf/2401.00001v2" rel="related" type="application/pdf"/>
          <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.CL"/>
          <category term="cs.CL"/>
          <category term="cs.AI"/>
        </entry>
      </feed>
    `);

    expect(papers).toHaveLength(1);
    expect(papers[0]).toMatchObject({
      source: "arxiv",
      sourceId: "2401.00001",
      title: "Language Model Reasoning After Post-Training",
      abstract: "We study inference and post-training.",
      authors: ["Ada Lovelace", "Alan Turing"],
      categories: ["cs.CL", "cs.AI"],
      primaryCategory: "cs.CL",
      publishedAt: "2024-01-01T01:02:03.000Z",
      updatedAt: "2024-01-02T03:04:05.000Z",
      sourceUrl: "https://arxiv.org/abs/2401.00001",
      pdfUrl: "https://arxiv.org/pdf/2401.00001"
    });
  });

  it("builds a submitted-date query URL for selected categories", () => {
    const url = buildArxivQueryUrl({
      categories: ["cs.CL", "cs.AI"],
      dateFrom: "2024-01-01",
      dateTo: "2024-01-02",
      maxResults: 50
    });

    expect(url.toString()).toContain("search_query=");
    expect(decodeURIComponent(url.searchParams.get("search_query") ?? "")).toContain("submittedDate:[202401010000 TO 202401022359]");
    expect(decodeURIComponent(url.searchParams.get("search_query") ?? "")).toContain("(cat:cs.CL OR cat:cs.AI)");
    expect(url.searchParams.get("max_results")).toBe("50");
  });

  it("builds an inclusive submitted-date query for one selected day", () => {
    const url = buildArxivQueryUrl({
      categories: ["cs.CL"],
      dateFrom: "2024-01-02",
      dateTo: "2024-01-02",
      maxResults: 50
    });

    expect(decodeURIComponent(url.searchParams.get("search_query") ?? "")).toContain("submittedDate:[202401020000 TO 202401022359]");
  });

  it("defaults to a larger crawl result limit", () => {
    const url = buildArxivQueryUrl({
      categories: ["cs.CL"],
      dateFrom: "2024-01-01",
      dateTo: "2024-01-02"
    });

    expect(url.searchParams.get("max_results")).toBe("200");
  });

  it("waits three seconds between arXiv API requests", async () => {
    resetArxivRateLimitForTests();
    let now = 1000;
    const sleeps: number[] = [];
    const fetcher = vi.fn().mockResolvedValue(makeArxivResponse(sampleFeed()));

    await fetchArxivPapers(makeFetchOptions(), {
      fetcher,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      }
    });
    await fetchArxivPapers(makeFetchOptions(), {
      fetcher,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      }
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([3000]);
  });

  it("retries transient arXiv failures after the request delay", async () => {
    resetArxivRateLimitForTests();
    let now = 1000;
    const sleeps: number[] = [];
    const fetcher = vi.fn()
      .mockResolvedValueOnce(makeArxivResponse("busy", { ok: false, status: 503 }))
      .mockResolvedValueOnce(makeArxivResponse(sampleFeed()));

    const papers = await fetchArxivPapers(makeFetchOptions(), {
      fetcher,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      }
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([3000]);
    expect(papers).toHaveLength(1);
  });

  it("backs off longer when arXiv returns a rate limit response", async () => {
    resetArxivRateLimitForTests();
    let now = 1000;
    const sleeps: number[] = [];
    const fetcher = vi.fn()
      .mockResolvedValueOnce(makeArxivResponse("rate limited", { ok: false, status: 429 }))
      .mockResolvedValueOnce(makeArxivResponse(sampleFeed()));

    const papers = await fetchArxivPapers(makeFetchOptions(), {
      fetcher,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      }
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([30000]);
    expect(papers).toHaveLength(1);
  });

  it("aborts arXiv requests that do not return", async () => {
    resetArxivRateLimitForTests();
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });

    try {
      const pending = fetchArxivPapers(makeFetchOptions(), { fetcher });
      const rejection = expect(pending).rejects.toThrow("arXiv request timed out");
      await vi.advanceTimersByTimeAsync(45_000);

      expect(signal?.aborted).toBe(true);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});

function makeFetchOptions() {
  return {
    categories: ["cs.CL"],
    dateFrom: "2026-05-27",
    dateTo: "2026-06-02",
    maxResults: 1
  };
}

function makeArxivResponse(body: string, overrides: { ok?: boolean; status?: number } = {}) {
  return {
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    text: async () => body
  } as Response;
}

function sampleFeed(): string {
  return `
    <feed>
      <entry>
        <id>http://arxiv.org/abs/2605.31584v1</id>
        <updated>2026-05-29T17:51:40Z</updated>
        <published>2026-05-29T17:51:40Z</published>
        <title>LongTraceRL</title>
        <summary>Learning long-context reasoning.</summary>
        <author><name>Ada Lovelace</name></author>
        <arxiv:primary_category term="cs.CL"/>
        <category term="cs.CL"/>
      </entry>
    </feed>
  `;
}
