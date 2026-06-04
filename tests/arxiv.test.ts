import { describe, expect, it, vi } from "vitest";

import { buildArxivQueryUrl, fetchArxivPapers, parseArxivAbsPage, parseArxivFeed, parseArxivListIds, parseArxivOaiFeed, resetArxivRateLimitForTests } from "../lib/sources/arxiv";

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

  it("parses arXiv list pages into unique arXiv ids", () => {
    expect(parseArxivListIds(`
      <dl>
        <dt><span class="list-identifier"><a title="Abstract" href="/abs/2606.00001">arXiv:2606.00001</a></span></dt>
        <dt><span class="list-identifier"><a title="Abstract" href="/abs/2606.00002v1">arXiv:2606.00002</a></span></dt>
        <dt><span class="list-identifier"><a title="Abstract" href="https://arxiv.org/abs/2606.00001">duplicate</a></span></dt>
      </dl>
    `)).toEqual(["2606.00001", "2606.00002"]);
  });

  it("parses arXiv abstract pages into normalized paper inputs", () => {
    expect(parseArxivAbsPage("2606.00003", sampleAbsPage("2606.00003"))).toMatchObject({
      source: "arxiv",
      sourceId: "2606.00003",
      title: "LongTraceRL 2606.00003",
      abstract: "Learning long-context reasoning from search traces.",
      authors: ["Ada Lovelace", "Alan Turing"],
      categories: ["cs.CL", "cs.AI"],
      primaryCategory: "cs.CL",
      publishedAt: "2026-06-03T00:00:00.000Z",
      sourceUrl: "https://arxiv.org/abs/2606.00003",
      pdfUrl: "https://arxiv.org/pdf/2606.00003"
    });
  });

  it("parses OAI-PMH arXiv metadata records", () => {
    const parsed = parseArxivOaiFeed(sampleOaiFeed(["2606.00006", "2606.00007"]));

    expect(parsed.papers.map((paper) => paper.sourceId)).toEqual(["2606.00006", "2606.00007"]);
    expect(parsed.papers[0]).toMatchObject({
      title: "OAI LongTraceRL 2606.00006",
      abstract: "OAI metadata for long-context reasoning.",
      authors: ["Ada Lovelace", "Alan Turing"],
      categories: ["cs.CL", "cs.AI"],
      primaryCategory: "cs.CL",
      publishedAt: "2026-06-03T00:00:00.000Z"
    });
    expect(parsed.resumptionToken).toBe("next-page-token");
  });

  it("uses OAI-PMH metadata as the default date-range fetch path", async () => {
    resetArxivRateLimitForTests();
    let now = Date.UTC(2026, 5, 4, 0, 0, 0);
    const fetcher = vi.fn().mockResolvedValue(makeArxivResponse(sampleOaiFeed(["2606.00008"], null)));

    const papers = await fetchArxivPapers({
      categories: ["cs.CL"],
      dateFrom: "2026-06-03",
      dateTo: "2026-06-04",
      maxResults: 20
    }, {
      fetcher,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      }
    });

    const urls = fetcher.mock.calls.map((call) => call[0] as URL);
    expect(urls[0].toString()).toContain("https://export.arxiv.org/oai2?verb=ListRecords");
    expect(urls[0].searchParams.get("set")).toBe("cs:cs:CL");
    expect(urls[0].searchParams.get("from")).toBe("2026-06-03");
    expect(urls[0].searchParams.get("until")).toBe("2026-06-04");
    expect(urls[0].searchParams.has("search_query")).toBe(false);
    expect(papers.map((paper) => paper.sourceId)).toEqual(["2606.00008"]);
  });

  it("uses arXiv list and abstract pages without export API metadata lookups for recent date ranges", async () => {
    resetArxivRateLimitForTests();
    let now = Date.UTC(2026, 5, 4, 0, 0, 0);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(makeArxivResponse(`
        <a title="Abstract" href="/abs/2606.00003">arXiv:2606.00003</a>
        <a title="Abstract" href="/abs/2606.00004">arXiv:2606.00004</a>
      `))
      .mockResolvedValueOnce(makeArxivResponse(sampleAbsPage("2606.00003")))
      .mockResolvedValueOnce(makeArxivResponse(sampleAbsPage("2606.00004")));

    const papers = await fetchArxivPapers({
      categories: ["cs.CL"],
      dateFrom: "2026-06-03",
      dateTo: "2026-06-04",
      maxResults: 20
    }, {
      fetcher,
      strategy: "list",
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      }
    });

    const urls = fetcher.mock.calls.map((call) => call[0] as URL);
    expect(urls[0].toString()).toBe("https://arxiv.org/list/cs.CL/new");
    expect(urls[1].toString()).toBe("https://arxiv.org/abs/2606.00003");
    expect(urls[2].toString()).toBe("https://arxiv.org/abs/2606.00004");
    expect(urls.some((url) => url.hostname === "export.arxiv.org")).toBe(false);
    expect(papers.map((paper) => paper.sourceId)).toEqual(["2606.00003", "2606.00004"]);
  });

  it("uses cached paper metadata before requesting arXiv abstract pages", async () => {
    resetArxivRateLimitForTests();
    let now = Date.UTC(2026, 5, 4, 0, 0, 0);
    const cachedPaper = makePaperInput("2606.00009");
    const fetcher = vi.fn().mockResolvedValueOnce(makeArxivResponse(`
      <a title="Abstract" href="/abs/2606.00009">arXiv:2606.00009</a>
    `));

    const papers = await fetchArxivPapers({
      categories: ["cs.CL"],
      dateFrom: "2026-06-03",
      dateTo: "2026-06-04",
      maxResults: 20
    }, {
      fetcher,
      strategy: "list",
      getCachedPaper: async (sourceId) => sourceId === cachedPaper.sourceId ? cachedPaper : null,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      }
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(papers.map((paper) => paper.sourceId)).toEqual(["2606.00009"]);
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

  it("fetches arXiv results in conservative pages", async () => {
    resetArxivRateLimitForTests();
    let now = 1000;
    const fetcher = vi.fn()
      .mockResolvedValueOnce(makeArxivResponse(sampleFeed(["2605.00001", "2605.00002"])))
      .mockResolvedValueOnce(makeArxivResponse(sampleFeed(["2605.00003", "2605.00004"])))
      .mockResolvedValueOnce(makeArxivResponse(sampleFeed(["2605.00005"])));

    const papers = await fetchArxivPapers({ ...makeFetchOptions(), maxResults: 5 }, {
      fetcher,
      pageSize: 2,
      strategy: "api",
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      }
    });

    const urls = fetcher.mock.calls.map((call) => call[0] as URL);

    expect(papers.map((paper) => paper.sourceId)).toEqual(["2605.00001", "2605.00002", "2605.00003", "2605.00004", "2605.00005"]);
    expect(urls.map((url) => url.searchParams.get("start"))).toEqual(["0", "2", "4"]);
    expect(urls.map((url) => url.searchParams.get("max_results"))).toEqual(["2", "2", "1"]);
  });

  it("waits fifteen seconds between arXiv API requests", async () => {
    resetArxivRateLimitForTests();
    let now = 1000;
    const sleeps: number[] = [];
    const fetcher = vi.fn().mockResolvedValue(makeArxivResponse(sampleFeed()));

    await fetchArxivPapers(makeFetchOptions(), {
      fetcher,
      strategy: "api",
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      }
    });
    await fetchArxivPapers(makeFetchOptions(), {
      fetcher,
      strategy: "api",
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      }
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([15000]);
  });

  it("honors persisted arXiv request timestamps between process instances", async () => {
    resetArxivRateLimitForTests();
    let now = 15000;
    let persistedLastRequestAt: number | null = 10000;
    const sleeps: number[] = [];
    const fetcher = vi.fn().mockResolvedValue(makeArxivResponse(sampleFeed()));

    await fetchArxivPapers(makeFetchOptions(), {
      fetcher,
      strategy: "api",
      getLastRequestAt: async () => persistedLastRequestAt,
      setLastRequestAt: async (value) => {
        persistedLastRequestAt = value;
      },
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      }
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([10000]);
    expect(persistedLastRequestAt).toBe(25000);
  });

  it("retries transient arXiv failures after conservative backoff", async () => {
    resetArxivRateLimitForTests();
    let now = 1000;
    const sleeps: number[] = [];
    const fetcher = vi.fn()
      .mockResolvedValueOnce(makeArxivResponse("busy", { ok: false, status: 503 }))
      .mockResolvedValueOnce(makeArxivResponse(sampleFeed()));

    const papers = await fetchArxivPapers(makeFetchOptions(), {
      fetcher,
      strategy: "api",
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

  it("retries timed out arXiv requests with conservative backoff", async () => {
    resetArxivRateLimitForTests();
    let now = 1000;
    const sleeps: number[] = [];
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("arXiv request timed out."))
      .mockResolvedValueOnce(makeArxivResponse(sampleFeed()));

    const papers = await fetchArxivPapers(makeFetchOptions(), {
      fetcher,
      pageSize: 1,
      strategy: "api",
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

  it("stops immediately and activates cooldown when arXiv returns a rate limit response", async () => {
    resetArxivRateLimitForTests();
    let now = 1000;
    let cooldownUntil: number | null = null;
    const sleeps: number[] = [];
    const fetcher = vi.fn().mockResolvedValue(makeArxivResponse("rate limited", { ok: false, status: 429 }));

    await expect(fetchArxivPapers(makeFetchOptions(), {
      fetcher,
      strategy: "api",
      setCooldownUntil: async (value) => {
        cooldownUntil = value;
      },
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      }
    })).rejects.toThrow("arXiv is cooling down after rate limiting");

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
    expect(cooldownUntil).toBe(7201000);
  });

  it("aborts arXiv requests that do not return", async () => {
    resetArxivRateLimitForTests();
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      const signal = init?.signal;
      if (signal) signals.push(signal);
      if (fetcher.mock.calls.length === 1) {
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      }
      return Promise.resolve(makeArxivResponse(sampleFeed()));
    });

    try {
      const pending = fetchArxivPapers(makeFetchOptions(), {
        fetcher,
        strategy: "api",
        requestTimeoutMs: 45_000,
        sleep: async () => {}
      });
      await vi.advanceTimersByTimeAsync(45_000);

      expect(signals[0]?.aborted).toBe(true);
      await expect(pending).resolves.toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses active cooldown after an arXiv 429 response", async () => {
    resetArxivRateLimitForTests();
    let now = 1000;
    const fetcher = vi.fn().mockResolvedValue(makeArxivResponse("rate limited", { ok: false, status: 429 }));

    await expect(fetchArxivPapers(makeFetchOptions(), {
      fetcher,
      strategy: "api",
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      }
    })).rejects.toThrow("arXiv is cooling down after rate limiting");

    await expect(fetchArxivPapers(makeFetchOptions(), {
      fetcher,
      strategy: "api",
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      }
    })).rejects.toThrow("arXiv is cooling down after rate limiting");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("honors persisted arXiv cooldown before making a request", async () => {
    resetArxivRateLimitForTests();
    const fetcher = vi.fn().mockResolvedValue(makeArxivResponse(sampleFeed()));

    await expect(fetchArxivPapers(makeFetchOptions(), {
      fetcher,
      strategy: "api",
      now: () => 1000,
      getCooldownUntil: async () => 5000
    })).rejects.toThrow("arXiv is cooling down after rate limiting");
    expect(fetcher).not.toHaveBeenCalled();
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

function makePaperInput(sourceId: string) {
  return {
    source: "arxiv" as const,
    sourceId,
    title: `Cached ${sourceId}`,
    abstract: "Cached metadata.",
    authors: ["Ada Lovelace"],
    categories: ["cs.CL"],
    primaryCategory: "cs.CL",
    publishedAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
    sourceUrl: `https://arxiv.org/abs/${sourceId}`,
    pdfUrl: `https://arxiv.org/pdf/${sourceId}`
  };
}

function makeArxivResponse(body: string, overrides: { ok?: boolean; status?: number } = {}) {
  return {
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    text: async () => body
  } as Response;
}

function sampleFeed(sourceIds = ["2605.31584"]): string {
  return `
    <feed>
      ${sourceIds.map((sourceId) => `
        <entry>
          <id>http://arxiv.org/abs/${sourceId}v1</id>
          <updated>2026-06-03T17:51:40Z</updated>
          <published>2026-06-03T17:51:40Z</published>
          <title>LongTraceRL ${sourceId}</title>
          <summary>Learning long-context reasoning.</summary>
          <author><name>Ada Lovelace</name></author>
          <arxiv:primary_category term="cs.CL"/>
          <category term="cs.CL"/>
        </entry>
      `).join("")}
    </feed>
  `;
}

function sampleAbsPage(sourceId: string): string {
  return `
    <html>
      <body>
        <h1 class="title mathjax"><span class="descriptor">Title:</span>LongTraceRL ${sourceId}</h1>
        <div class="authors"><span class="descriptor">Authors:</span>
          <a href="/search/cs?searchtype=author&amp;query=Lovelace%2C+A">Ada Lovelace</a>,
          <a href="/search/cs?searchtype=author&amp;query=Turing%2C+A">Alan Turing</a>
        </div>
        <blockquote class="abstract mathjax">
          <span class="descriptor">Abstract:</span>
          Learning long-context reasoning from search traces.
        </blockquote>
        <div class="dateline">[Submitted on 3 Jun 2026]</div>
        <td class="tablecell subjects">Computation and Language (cs.CL); Artificial Intelligence (cs.AI)</td>
      </body>
    </html>
  `;
}

function sampleOaiFeed(sourceIds: string[], resumptionToken: string | null = "next-page-token"): string {
  return `
    <OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
      <ListRecords>
        ${sourceIds.map((sourceId) => `
          <record>
            <metadata>
              <arXiv xmlns="http://arxiv.org/OAI/arXiv/">
                <id>${sourceId}</id>
                <created>2026-06-03</created>
                <updated>2026-06-03</updated>
                <authors>
                  <author><keyname>Lovelace</keyname><forenames>Ada</forenames></author>
                  <author><keyname>Turing</keyname><forenames>Alan</forenames></author>
                </authors>
                <title>OAI LongTraceRL ${sourceId}</title>
                <categories>cs.CL cs.AI</categories>
                <abstract>OAI metadata for long-context reasoning.</abstract>
              </arXiv>
            </metadata>
          </record>
        `).join("")}
        ${resumptionToken ? `<resumptionToken>${resumptionToken}</resumptionToken>` : ""}
      </ListRecords>
    </OAI-PMH>
  `;
}
