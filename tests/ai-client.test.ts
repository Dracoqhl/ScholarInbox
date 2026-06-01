import { describe, expect, it, vi } from "vitest";

import { testAiConnection } from "../lib/ai/client";

describe("AI client", () => {
  it("reports missing configuration without calling the provider", async () => {
    const fetcher = vi.fn();

    const result = await testAiConnection(
      {
        baseUrl: "https://api.openai.com/v1",
        model: "",
        apiKey: ""
      },
      fetcher
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe("not_configured");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends a minimal chat completion request to an OpenAI-compatible endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "chatcmpl-test" })
    });

    const result = await testAiConnection(
      {
        baseUrl: "https://api.example.com/v1/",
        model: "test-model",
        apiKey: "test-key"
      },
      fetcher
    );

    expect(result).toEqual({ ok: true, status: "ok", message: "API connection succeeded." });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          "Content-Type": "application/json"
        })
      })
    );
  });

  it("reports provider errors without exposing the API key", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "invalid api key test-key"
    });

    const result = await testAiConnection(
      {
        baseUrl: "https://api.example.com/v1",
        model: "test-model",
        apiKey: "test-key"
      },
      fetcher
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe("provider_error");
    expect(result.message).toContain("401");
    expect(result.message).not.toContain("test-key");
  });
});
