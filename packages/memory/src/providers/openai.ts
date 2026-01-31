/**
 * OpenAI Embedding Provider
 * 
 * Industry-standard embeddings with flexible dimensionality.
 * Supports text-embedding-3-small and text-embedding-3-large models.
 */

import type { Embedding, HealthCheckResult, IEmbeddingProvider, ProviderConfig } from "./types.js";

const VALID_DIMENSIONS = [256, 512, 1536, 3072] as const;

export class OpenAIProvider implements IEmbeddingProvider {
  readonly name = "OpenAI";
  readonly type = "openai" as const;
  readonly dimensions: number;
  
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key is required (config.apiKey or OPENAI_API_KEY)");
    }
    
    this.apiKey = apiKey;
    this.model = config.model || "text-embedding-3-small";
    this.baseUrl = config.baseUrl || "https://api.openai.com/v1";
    this.dimensions = this.validateDimensions(config.dimensions);
  }

  private validateDimensions(dim?: number): number {
    if (!dim) return 1536; // Default for text-embedding-3-small
    
    if (!VALID_DIMENSIONS.includes(dim as typeof VALID_DIMENSIONS[number])) {
      throw new Error(
        `Invalid dimensions ${dim}. Must be one of: ${VALID_DIMENSIONS.join(", ")}`
      );
    }
    
    return dim;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      // Lightweight check: list models endpoint
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { 
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        }
      });

      if (response.status === 401) {
        return {
          ok: false,
          reason: "Invalid API key",
          hint: "Check your OPENAI_API_KEY environment variable"
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          reason: `API returned ${response.status}`,
          hint: "Check your network connection and API status"
        };
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "Unknown error",
        hint: "Verify network connectivity to OpenAI API"
      };
    }
  }

  async embed(texts: string[]): Promise<Embedding[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding failed: ${error}`);
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
