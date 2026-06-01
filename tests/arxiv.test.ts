import { describe, expect, it } from "vitest";

import { buildArxivQueryUrl, parseArxivFeed } from "../lib/sources/arxiv";

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
});
