import { describe, expect, it } from "vitest";

import { fetchArxivTopicCandidates } from "@/lib/topic-search/sources/arxiv-search";
import { fetchSemanticScholarTopicCandidates } from "@/lib/topic-search/sources/semantic-scholar";

describe("topic search source fetchers", () => {
  it("normalizes arXiv search results into topic candidates", async () => {
    const seenUrls: string[] = [];
    const candidates = await fetchArxivTopicCandidates({
      querySeeds: ["OPD"],
      dateFrom: "2024-01-01",
      dateTo: "2026-06-05",
      maxResults: 5,
      fetcher: async (url) => {
        seenUrls.push(String(url));
        return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2401.00123v1</id>
    <updated>2026-06-01T00:00:00Z</updated>
    <published>2026-06-01T00:00:00Z</published>
    <title>OPD for LLM Reasoning</title>
    <summary>Policy distillation for reasoning.</summary>
    <author><name>Ada Lovelace</name></author>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.AI"/>
    <category term="cs.AI"/>
  </entry>
</feed>`);
      }
    });

    expect(seenUrls[0]).toContain("search_query=");
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      discoveryChannel: "arxiv_search",
      matchedQueries: ["OPD"],
      canonicalPlatform: "arxiv",
      canonicalUrl: "https://arxiv.org/abs/2401.00123",
      externalIds: { arxiv: "2401.00123" }
    });
  });

  it("normalizes Semantic Scholar results and prefers arXiv canonical identity when available", async () => {
    const candidates = await fetchSemanticScholarTopicCandidates({
      querySeeds: ["online policy distillation"],
      dateFrom: "2024-01-01",
      dateTo: "2026-06-05",
      maxResults: 5,
      fetcher: async () =>
        new Response(JSON.stringify({
          data: [
            {
              paperId: "S2-A",
              corpusId: 123,
              title: "Online Policy Distillation",
              abstract: "A paper about LLM policy distillation.",
              url: "https://www.semanticscholar.org/paper/S2-A",
              year: 2025,
              publicationDate: "2025-05-10",
              authors: [{ name: "Alan Turing" }],
              externalIds: { ArXiv: "2505.01234", DOI: "10.1234/opd" },
              openAccessPdf: { url: "https://arxiv.org/pdf/2505.01234" },
              fieldsOfStudy: ["Computer Science"]
            }
          ]
        }))
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].paper).toMatchObject({
      source: "arxiv",
      sourceId: "2505.01234",
      title: "Online Policy Distillation",
      pdfUrl: "https://arxiv.org/pdf/2505.01234"
    });
    expect(candidates[0]).toMatchObject({
      discoveryChannel: "semantic_scholar",
      matchedQueries: ["online policy distillation"],
      canonicalPlatform: "arxiv",
      externalIds: {
        arxiv: "2505.01234",
        doi: "10.1234/opd",
        semanticScholar: "S2-A",
        corpusId: "123"
      }
    });
  });
});
