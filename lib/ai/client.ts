export type AiConnectionConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type AiConnectionResult =
  | { ok: true; status: "ok"; message: string }
  | { ok: false; status: "not_configured" | "provider_error" | "network_error"; message: string };

type FetchLike = typeof fetch;

export async function testAiConnection(config: AiConnectionConfig, fetcher: FetchLike = fetch): Promise<AiConnectionResult> {
  const baseUrl = config.baseUrl.trim();
  const model = config.model.trim();
  const apiKey = config.apiKey.trim();

  if (!baseUrl || !model || !apiKey) {
    return {
      ok: false,
      status: "not_configured",
      message: "AI_BASE_URL, AI_MODEL, and AI_API_KEY must all be configured."
    };
  }

  try {
    const response = await fetcher(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with ok." }],
        temperature: 0,
        max_tokens: 4
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        status: "provider_error",
        message: sanitizeProviderError(`Provider returned ${response.status}. ${body}`, apiKey)
      };
    }

    return { ok: true, status: "ok", message: "API connection succeeded." };
  } catch (error) {
    return {
      ok: false,
      status: "network_error",
      message: error instanceof Error ? error.message : "Network request failed."
    };
  }
}

export function getAiConnectionConfigFromEnv(): AiConnectionConfig {
  return {
    baseUrl: process.env.AI_BASE_URL ?? "",
    model: process.env.AI_MODEL ?? "",
    apiKey: process.env.AI_API_KEY ?? ""
  };
}

function sanitizeProviderError(message: string, apiKey: string): string {
  return apiKey ? message.replaceAll(apiKey, "[redacted]") : message;
}
