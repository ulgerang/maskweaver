/**
 * OpenRouter Embedding Provider
 * 
 * Multi-model gateway supporting various embedding providers.
 * Requires HTTP-Referer and X-Title headers for API tracking.
 */

import type { Embedding, HealthCheckResult, IEmbeddingProvider, ProviderConfig } from "./types.js";

export class OpenRouterProvider implements IEmbeddingProvider {
  readonly name = "OpenRouter";
  readonly type = "openrouter" as const;
  readonly dimensions: number;
  
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly referer: string;
  private readonly title: string;

  constructor(config: ProviderConfig) {
    const apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OpenRouter API key is required (config.apiKey or OPENROUTER_API_KEY)");
    }
    
    this.apiKey = apiKey;
    this.model = config.model || "openai/text-embedding-3-small";
    this.baseUrl = config.baseUrl || "https://openrouter.ai/api/v1";
    this.dimensions = config.dimensions || 1536;
    
    // OpenRouter requires these headers for tracking
    this.referer = process.env.OPENROUTER_REFERER || "https://maskweaver.dev";
    this.title = process.env.OPENROUTER_TITLE || "MaskWeaver";
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      // Check API key validity
      const response = await fetch(`${this.baseUrl}/auth/key`, {
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "HTTP-Referer": this.referer,
          "X-Title": this.title
        }
      });

      if (response.status === 401) {
        return {
          ok: false,
          reason: "Invalid API key",
          hint: "Check your OPENROUTER_API_KEY environment variable"
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          reason: `API returned ${response.status}`,
          hint: "Verify your OpenRouter account status"
        };
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "Unknown error",
        hint: "Check network connectivity to OpenRouter"
      };
    }
  }

  async embed(texts: string[]): Promise<Embedding[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "HTTP-Referer": this.referer,
        "X-Title": this.title,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        input: texts
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter embedding failed: ${error}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map((item) => item.embedding);
  }

  async embedQuery(text: string): Promise<Embedding> {
    const [embedding] = await this.embed([text]);
    return embedding;
  }
}
